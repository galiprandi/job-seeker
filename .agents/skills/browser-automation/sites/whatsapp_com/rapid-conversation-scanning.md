# Rapid conversation scanning — web.whatsapp.com

**Date:** 2026-08-15
**Type:** shortcut
**Site:** web.whatsapp.com

## What was expected

The existing guide covers searching for a contact, opening a chat, and extracting messages. The obvious approach to check multiple conversations for new messages would be to open each chat one by one, extract the full conversation, and compare against known state — slow and token-heavy.

## What was found

Three patterns enable rapid scanning of many conversations without opening each chat fully:

### 1. Chat list preview (no chat open)

The chat list sidebar shows the last message preview for each conversation. After searching for a contact by phone or name, the filtered list shows the last message text inline in the `gridcell`. This is enough to detect whether the last message is from the user ("Tú:") or from the contact, without opening the chat.

```bash
# Search by phone fragment or name
node scripts/browser.js exec fill <search_ref> "<phone_fragment>"
# Wait for filtered results
# The gridcell text includes: <contact_name> <time> <last_message_preview>
# If the preview starts with your own message text, the contact hasn't replied
# If it shows new text, there's a new incoming message
```

### 2. Bulk scan via loop

A shell loop can scan all contacts rapidly by:
1. Filling the search box with a phone fragment or name
2. Reading the filtered gridcell text (last message preview + timestamp)
3. Clearing the search
4. Moving to the next contact

Each iteration takes ~3 seconds (fill + wait + snapshot). For 10 contacts, the full scan takes ~30 seconds.

```bash
for ENTRY in "<phone1>:<name1>" "<phone2>:<name2>" ...; do
  NUM="${ENTRY%%:*}"
  NAME="${ENTRY##*:}"
  # Get fresh search ref
  SEARCH_REF=$(node scripts/browser.js exec snapshot 2>/dev/null | grep "Buscar un chat" | head -1 | sed 's/.*\[ref=\(f[0-9a-f]*\).*/\1/')
  node scripts/browser.js exec fill "$SEARCH_REF" "$NUM" 2>/dev/null
  sleep 2
  # Read last message preview from gridcell
  node scripts/browser.js exec snapshot 2>/dev/null | grep -A3 "$NUM" | grep "Ayer\|Hoy\|escribiendo\|mensaje no leído\|<time_pattern>" | head -2
  # Clear search
  CLEAR_REF=$(node scripts/browser.js exec snapshot 2>/dev/null | grep 'End icon' | head -1 | sed 's/.*\[ref=\(f[0-9a-f]*\).*/\1/')
  node scripts/browser.js exec click "$CLEAR_REF" 2>/dev/null
  sleep 1
done
```

### 3. "escribiendo..." indicator

When a contact is typing, the chat list gridcell shows `"escribiendo..."` instead of the last message preview. This is visible without opening the chat and indicates an imminent reply.

### 4. Unread badge is unreliable for scanning

The "mensaje no leído" badge is NOT a reliable indicator for scanning because:
- Messages may have been read on the phone but not on Web
- The badge persists even after the user has seen the message on mobile
- Some messages arrive without triggering the badge

**Do not use unread count as the sole signal.** Always check the last message preview text to determine if there is a genuinely new incoming message.

### 5. Opening a chat by phone via URL

To open a specific chat without searching:
```
https://web.whatsapp.com/send/?phone=<international_number>
```
This opens the chat directly if it exists, or creates a new chat if the number is on WhatsApp. If the number is not on WhatsApp, a dialog appears: "El número <number> no está en WhatsApp."

This is faster than search-and-click for contacting new numbers, but does NOT work for navigating to existing chats by URL (the `send?phone=` URL always opens a new chat context, which can cause the page to redirect to the main list).

### 6. Stale refs after navigation

After `goto "https://web.whatsapp.com/"`, all refs from the previous snapshot are invalid. Always take a fresh snapshot before interacting. The search box ref changes every navigation.

### 7. Drafts persist

If a message is typed in the composer but not sent, it persists as a "Borrador:" (draft) in the chat list. This is visible in the gridcell preview. Drafts are useful for preparing messages without sending, but can be confusing if mistaken for a sent message.

## Reproduction

```bash
# Pattern: rapid scan of N contacts
# 1. Navigate to WhatsApp Web
node scripts/browser.js goto "https://web.whatsapp.com/"
# Wait for load
node scripts/browser.js exec eval "(async () => {
  for (let i = 0; i < 30; i++) {
    if (document.querySelector('div[role=\"textbox\"]')) return 'ready';
    await new Promise(r => setTimeout(r, 500));
  }
  return 'timeout';
})()"

# 2. For each contact, search and read preview
SEARCH_REF=$(node scripts/browser.js exec snapshot 2>/dev/null | grep "Buscar un chat" | head -1 | sed 's/.*\[ref=\(f[0-9a-f]*\).*/\1/')
node scripts/browser.js exec fill "$SEARCH_REF" "<phone_fragment>"
sleep 2
# Read the gridcell — last message preview is in the text
node scripts/browser.js exec snapshot 2>/dev/null | grep "<phone_fragment>" | head -3

# 3. If new message detected, open chat and respond
# 4. Clear search and move to next contact
```

## Suggested guide update

Add to `sites/whatsapp_com/guide.md`:
- **Rapid scanning section:** chat list preview extraction without opening chats
- **Bulk scan pattern:** shell loop with search + preview + clear
- **"escribiendo..." indicator:** typing indicator visible in chat list
- **Unread badge caveat:** not reliable as sole signal (mobile read state sync issue)
- **Draft detection:** "Borrador:" prefix in gridcell preview
- **URL navigation caveat:** `send?phone=` opens new chat context, does not navigate to existing chats reliably
- **Stale refs after navigation:** always fresh snapshot after `goto`
