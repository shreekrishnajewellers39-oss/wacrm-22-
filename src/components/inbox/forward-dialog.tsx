"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Loader2, Forward, Check, Clock, AlertCircle, User } from "lucide-react";
import { toast } from "sonner";
import { differenceInHours } from "date-fns";
import type { Message, Contact } from "@/types";
import { cn } from "@/lib/utils";

interface ConversationTarget {
  id: string;
  contact_id: string;
  contact?: Contact | null;
  last_message_at: string;
  is24hActive: boolean;
}

interface ForwardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: Message | null;
  currentConversationId?: string;
  onForwardSuccess?: (targetConversationId: string) => void;
}

export function ForwardDialog({
  open,
  onOpenChange,
  message,
  currentConversationId,
  onForwardSuccess,
}: ForwardDialogProps) {
  const [loading, setLoading] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [targets, setTargets] = useState<ConversationTarget[]>([]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setSendingId(null);
      return;
    }

    async function loadTargets() {
      setLoading(true);
      try {
        const supabase = createClient();
        const { data: convs, error: convsErr } = await supabase
          .from("conversations")
          .select("id, contact_id, last_message_at, updated_at, contact:contacts(*)")
          .order("last_message_at", { ascending: false })
          .limit(50);

        if (convsErr) throw convsErr;

        const convList = (convs || []) as unknown as {
          id: string;
          contact_id: string;
          contact: Contact | null;
          last_message_at: string;
        }[];

        // Fetch latest customer message per conversation to determine 24h window
        const convIds = convList.map((c) => c.id);
        const { data: customerMsgs } = await supabase
          .from("messages")
          .select("conversation_id, created_at")
          .in("conversation_id", convIds)
          .eq("sender_type", "customer")
          .order("created_at", { ascending: false });

        const lastCustomerMsgMap = new Map<string, string>();
        for (const m of customerMsgs || []) {
          if (!lastCustomerMsgMap.has(m.conversation_id)) {
            lastCustomerMsgMap.set(m.conversation_id, m.created_at);
          }
        }

        const resolved: ConversationTarget[] = convList
          .filter((c) => c.id !== currentConversationId)
          .map((c) => {
            const lastAt = lastCustomerMsgMap.get(c.id);
            const is24hActive = lastAt
              ? differenceInHours(new Date(), new Date(lastAt)) < 24
              : false;
            return {
              id: c.id,
              contact_id: c.contact_id,
              contact: c.contact,
              last_message_at: c.last_message_at,
              is24hActive,
            };
          });

        setTargets(resolved);
      } catch (err) {
        console.error("Failed to load forward targets:", err);
        toast.error("Failed to load contacts for forwarding");
      } finally {
        setLoading(false);
      }
    }

    void loadTargets();
  }, [open, currentConversationId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return targets;
    return targets.filter((t) => {
      const name = (t.contact?.name || "").toLowerCase();
      const phone = (t.contact?.phone || "").toLowerCase();
      return name.includes(q) || phone.includes(q);
    });
  }, [targets, search]);

  async function handleForward(target: ConversationTarget) {
    if (!message || sendingId) return;

    // Check 24-hour window for free-form media or text
    if (!target.is24hActive && message.content_type !== "template") {
      toast.error(
        "Cannot forward: Customer's 24-hour WhatsApp session has expired. You can only send approved templates outside 24h."
      );
      return;
    }

    setSendingId(target.id);
    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: target.id,
          message_type: message.content_type || "image",
          media_url: message.media_url,
          content_text: message.content_text,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Forward failed (${res.status})`);
      }

      const contactName = target.contact?.name || target.contact?.phone || "Customer";
      toast.success(`Forwarded to ${contactName}!`);
      onOpenChange(false);
      onForwardSuccess?.(target.id);
    } catch (err) {
      console.error("Forward error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to forward message");
    } finally {
      setSendingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-popover border-border text-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
            <Forward className="h-5 w-5 text-primary" />
            Forward Message
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Select a customer or conversation to send this {message?.content_type || "message"} to.
          </DialogDescription>
        </DialogHeader>

        {/* Message preview snippet */}
        {message && (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-2.5">
            {message.media_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={message.media_url}
                alt="Preview"
                className="h-12 w-12 rounded object-cover border border-border shrink-0"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded bg-primary/10 text-primary shrink-0">
                <Forward className="h-5 w-5" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-foreground truncate">
                {message.content_type === "image"
                  ? "Photo"
                  : message.content_type === "video"
                  ? "Video"
                  : message.content_type === "document"
                  ? "Document"
                  : "Text Message"}
              </p>
              {message.content_text && (
                <p className="text-[11px] text-muted-foreground truncate">
                  {message.content_text}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-muted border-border text-foreground placeholder:text-muted-foreground h-9 text-sm"
            autoFocus
          />
        </div>

        {/* Target list */}
        <div className="max-h-64 overflow-y-auto space-y-1 divide-y divide-border/50">
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">
              No conversations found
            </div>
          ) : (
            filtered.map((t) => {
              const name = t.contact?.name || "Unknown";
              const phone = t.contact?.phone || "";
              const busy = sendingId === t.id;

              return (
                <div
                  key={t.id}
                  className="flex items-center justify-between py-2 px-2 hover:bg-muted/50 rounded-lg transition-colors cursor-pointer"
                  onClick={() => handleForward(t)}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0 text-xs font-semibold">
                      {name.charAt(0).toUpperCase() || <User className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="truncate">{phone}</span>
                        {t.is24hActive ? (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.2 text-[10px] text-emerald-400 font-medium shrink-0">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            24h Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.2 text-[10px] text-amber-400 font-medium shrink-0" title="24h session expired">
                            <Clock className="h-2.5 w-2.5" />
                            Expired
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant={t.is24hActive ? "default" : "outline"}
                    disabled={busy || !t.is24hActive}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleForward(t);
                    }}
                    className={cn(
                      "h-7 px-2.5 text-xs shrink-0",
                      t.is24hActive
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "border-border text-muted-foreground opacity-50 cursor-not-allowed"
                    )}
                  >
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <Forward className="h-3.5 w-3.5 mr-1" />
                        Send
                      </>
                    )}
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
