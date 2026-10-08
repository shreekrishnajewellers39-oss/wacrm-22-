import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { markMessageAsRead } from '@/lib/whatsapp/meta-api';
import { decrypt, isLegacyFormat } from '@/lib/whatsapp/encryption';

/**
 * POST /api/whatsapp/read
 *
 * Body: { conversation_id: string }
 *
 * Marks inbound messages in this conversation as read locally in Supabase
 * and dispatches a "read" status to Meta WhatsApp Cloud API so that the
 * customer receives double blue ticks (✓✓) on WhatsApp.
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('viewer');

    const body = await request.json();
    const { conversation_id } = body as { conversation_id?: string };

    if (!conversation_id) {
      return NextResponse.json(
        { error: 'conversation_id is required' },
        { status: 400 },
      );
    }

    // Reset unread_count on the conversation
    await supabase
      .from('conversations')
      .update({ unread_count: 0 })
      .eq('id', conversation_id)
      .eq('account_id', accountId);

    // Find any unread inbound customer messages
    const { data: unreadMessages } = await supabase
      .from('messages')
      .select('id, message_id, status, sender_type')
      .eq('conversation_id', conversation_id)
      .eq('sender_type', 'customer')
      .neq('status', 'read')
      .order('created_at', { ascending: false })
      .limit(10);

    if (unreadMessages && unreadMessages.length > 0) {
      const msgIds = unreadMessages.map((m) => m.id);
      await supabase
        .from('messages')
        .update({ status: 'read' })
        .in('id', msgIds);

      // In WhatsApp Cloud API, marking the latest inbound message as read
      // marks the thread as read and shows blue ticks to the sender.
      const targetMessage = unreadMessages.find((m) => m.message_id);
      if (targetMessage?.message_id) {
        const { data: config } = await supabase
          .from('whatsapp_config')
          .select('phone_number_id, access_token')
          .eq('account_id', accountId)
          .maybeSingle();

        if (config?.phone_number_id && config?.access_token) {
          const accessToken = isLegacyFormat(config.access_token)
            ? config.access_token
            : decrypt(config.access_token);

          await markMessageAsRead({
            phoneNumberId: config.phone_number_id,
            accessToken,
            messageId: targetMessage.message_id,
          });
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
