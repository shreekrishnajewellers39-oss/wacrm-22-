import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { markMessageAsRead } from '@/lib/whatsapp/meta-api';
import { decrypt, isLegacyFormat } from '@/lib/whatsapp/encryption';

/**
 * POST /api/whatsapp/read
 *
 * Body: { conversation_id: string, message_id?: string }
 *
 * Marks inbound messages in this conversation as read locally in Supabase
 * and dispatches a "read" status to Meta WhatsApp Cloud API so that the
 * customer receives double blue ticks (✓✓) on WhatsApp.
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('viewer');

    const body = await request.json();
    const { conversation_id, message_id: clientMessageId } = body as {
      conversation_id?: string;
      message_id?: string;
    };

    if (!conversation_id) {
      return NextResponse.json(
        { error: 'conversation_id is required' },
        { status: 400 },
      );
    }

    // 1. Reset unread_count on the conversation
    await supabase
      .from('conversations')
      .update({ unread_count: 0 })
      .eq('id', conversation_id)
      .eq('account_id', accountId);

    // 2. Mark unread messages in DB as read
    await supabase
      .from('messages')
      .update({ status: 'read' })
      .eq('conversation_id', conversation_id)
      .eq('sender_type', 'customer')
      .neq('status', 'read');

    // 3. Resolve the target Meta message ID (wamid)
    let targetMetaId = clientMessageId;
    if (!targetMetaId || !targetMetaId.startsWith('wamid.')) {
      const { data: latestMsg } = await supabase
        .from('messages')
        .select('message_id')
        .eq('conversation_id', conversation_id)
        .eq('sender_type', 'customer')
        .not('message_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestMsg?.message_id) {
        targetMetaId = latestMsg.message_id;
      }
    }

    // 4. Send read receipt to Meta Cloud API if we have a target message
    if (targetMetaId && targetMetaId.startsWith('wamid.')) {
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
          messageId: targetMetaId,
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in /api/whatsapp/read:', error);
    return toErrorResponse(error);
  }
}
