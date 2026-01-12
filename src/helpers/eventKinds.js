// Human-readable event kind labels for NIP-07 signer
// Based on https://github.com/nostr-protocol/nips

export const EVENT_KINDS = {
  0: { label: 'Profile Update', risk: 'medium', description: 'Updates your profile metadata' },
  1: { label: 'Text Note', risk: 'low', description: 'Publishes a text note' },
  2: { label: 'Relay List', risk: 'medium', description: 'Updates your relay recommendations' },
  3: { label: 'Contacts', risk: 'medium', description: 'Updates your contact list' },
  4: { label: 'Encrypted DM', risk: 'medium', description: 'Sends an encrypted message' },
  5: { label: 'Delete', risk: 'high', description: 'Requests deletion of events' },
  6: { label: 'Repost', risk: 'low', description: 'Reposts another note' },
  7: { label: 'Reaction', risk: 'low', description: 'Reacts to another note' },
  8: { label: 'Badge Award', risk: 'low', description: 'Awards a badge' },
  9: { label: 'Group Chat', risk: 'low', description: 'Group chat message' },
  10: { label: 'Group Chat', risk: 'low', description: 'Group chat message' },
  11: { label: 'Group Thread', risk: 'low', description: 'Group thread reply' },
  12: { label: 'Group Thread', risk: 'low', description: 'Group thread reply' },
  13: { label: 'Seal', risk: 'medium', description: 'Sealed/encrypted content' },
  14: { label: 'Direct Message', risk: 'medium', description: 'Gift-wrapped DM' },
  16: { label: 'Repost', risk: 'low', description: 'Generic repost' },
  40: { label: 'Channel Create', risk: 'low', description: 'Creates a channel' },
  41: { label: 'Channel Metadata', risk: 'low', description: 'Updates channel info' },
  42: { label: 'Channel Message', risk: 'low', description: 'Channel message' },
  43: { label: 'Channel Hide', risk: 'low', description: 'Hides a message' },
  44: { label: 'Channel Mute', risk: 'low', description: 'Mutes a user' },
  1021: { label: 'Bid', risk: 'medium', description: 'Auction bid' },
  1022: { label: 'Bid Confirmation', risk: 'medium', description: 'Confirms a bid' },
  1040: { label: 'OpenTimestamps', risk: 'low', description: 'Timestamp attestation' },
  1059: { label: 'Gift Wrap', risk: 'medium', description: 'Gift-wrapped event' },
  1063: { label: 'File Metadata', risk: 'low', description: 'File header' },
  1311: { label: 'Live Chat', risk: 'low', description: 'Live activity chat' },
  1617: { label: 'Patches', risk: 'low', description: 'Git patches' },
  1621: { label: 'Issues', risk: 'low', description: 'Git issues' },
  1622: { label: 'Replies', risk: 'low', description: 'Git replies' },
  1971: { label: 'Problem Tracker', risk: 'low', description: 'Problem report' },
  1984: { label: 'Report', risk: 'medium', description: 'Reports content/user' },
  1985: { label: 'Label', risk: 'low', description: 'Labels content' },
  4550: { label: 'Community Post', risk: 'low', description: 'Community approval' },
  5000: { label: 'Job Request', risk: 'low', description: 'Job request (5000-5999)' },
  6000: { label: 'Job Result', risk: 'low', description: 'Job result (6000-6999)' },
  7000: { label: 'Job Feedback', risk: 'low', description: 'Job feedback' },
  9041: { label: 'Zap Goal', risk: 'low', description: 'Zap goal' },
  9734: { label: 'Zap Request', risk: 'medium', description: 'Requests a zap payment' },
  9735: { label: 'Zap Receipt', risk: 'low', description: 'Confirms zap received' },
  10000: { label: 'Mute List', risk: 'medium', description: 'Updates mute list' },
  10001: { label: 'Pin List', risk: 'low', description: 'Updates pinned notes' },
  10002: { label: 'Relay List', risk: 'medium', description: 'Updates relay list' },
  10003: { label: 'Bookmark List', risk: 'low', description: 'Updates bookmarks' },
  10004: { label: 'Communities', risk: 'low', description: 'Updates communities' },
  10005: { label: 'Public Chats', risk: 'low', description: 'Updates public chats' },
  10006: { label: 'Blocked Relays', risk: 'low', description: 'Updates blocked relays' },
  10007: { label: 'Search Relays', risk: 'low', description: 'Updates search relays' },
  10009: { label: 'User Groups', risk: 'low', description: 'Updates user groups' },
  10015: { label: 'Interests', risk: 'low', description: 'Updates interests' },
  10030: { label: 'Emoji List', risk: 'low', description: 'Updates custom emojis' },
  10096: { label: 'File Storage', risk: 'low', description: 'Updates file servers' },
  13194: { label: 'Wallet Info', risk: 'medium', description: 'Wallet connection info' },
  21000: { label: 'Lightning Pub', risk: 'low', description: 'Lightning pub RPC' },
  22242: { label: 'Auth', risk: 'high', description: 'Client authentication' },
  23194: { label: 'Wallet Request', risk: 'high', description: 'Wallet pay request' },
  23195: { label: 'Wallet Response', risk: 'medium', description: 'Wallet response' },
  24133: { label: 'Nostr Connect', risk: 'high', description: 'Remote signer request' },
  27235: { label: 'HTTP Auth', risk: 'medium', description: 'HTTP authentication' },
  30000: { label: 'Follow Sets', risk: 'medium', description: 'Updates follow sets' },
  30001: { label: 'Generic Lists', risk: 'low', description: 'Updates lists' },
  30002: { label: 'Relay Sets', risk: 'medium', description: 'Updates relay sets' },
  30003: { label: 'Bookmark Sets', risk: 'low', description: 'Updates bookmark sets' },
  30004: { label: 'Curation Sets', risk: 'low', description: 'Updates curation sets' },
  30008: { label: 'Profile Badges', risk: 'low', description: 'Updates profile badges' },
  30009: { label: 'Badge Definition', risk: 'low', description: 'Defines a badge' },
  30017: { label: 'Stall', risk: 'low', description: 'Creates/updates stall' },
  30018: { label: 'Product', risk: 'low', description: 'Creates/updates product' },
  30019: { label: 'Marketplace', risk: 'low', description: 'Marketplace UI' },
  30020: { label: 'Product Sold', risk: 'low', description: 'Product sold as auction' },
  30023: { label: 'Long-form Post', risk: 'low', description: 'Publishes an article' },
  30024: { label: 'Draft', risk: 'low', description: 'Saves a draft' },
  30030: { label: 'Emoji Set', risk: 'low', description: 'Defines emoji set' },
  30063: { label: 'File Storage', risk: 'low', description: 'Release artifact set' },
  30078: { label: 'App Data', risk: 'low', description: 'Application-specific data' },
  30311: { label: 'Live Event', risk: 'low', description: 'Live activity' },
  30315: { label: 'User Status', risk: 'low', description: 'Updates user status' },
  30402: { label: 'Classified', risk: 'low', description: 'Classified listing' },
  30403: { label: 'Draft Classified', risk: 'low', description: 'Draft classified' },
  31922: { label: 'Calendar Event', risk: 'low', description: 'Date-based calendar event' },
  31923: { label: 'Calendar Event', risk: 'low', description: 'Time-based calendar event' },
  31924: { label: 'Calendar', risk: 'low', description: 'Calendar definition' },
  31925: { label: 'Calendar RSVP', risk: 'low', description: 'Calendar RSVP' },
  31989: { label: 'Handler Rec.', risk: 'low', description: 'Handler recommendation' },
  31990: { label: 'Handler Info', risk: 'low', description: 'Handler information' },
  34550: { label: 'Community', risk: 'medium', description: 'Community definition' },
  39000: { label: 'Group Members', risk: 'medium', description: 'Updates group members' },
  39001: { label: 'Group Admins', risk: 'high', description: 'Updates group admins' },
  39002: { label: 'Group Metadata', risk: 'medium', description: 'Updates group metadata' },
}

export function getEventKindInfo(kind) {
  // Handle ranges
  if (kind >= 5000 && kind < 6000) {
    return { label: 'Job Request', risk: 'low', description: 'Data vending machine request' }
  }
  if (kind >= 6000 && kind < 7000) {
    return { label: 'Job Result', risk: 'low', description: 'Data vending machine result' }
  }
  if (kind >= 4000 && kind < 5000) {
    return { label: 'Encrypted Event', risk: 'medium', description: 'Encrypted channel event' }
  }

  return EVENT_KINDS[kind] || {
    label: 'Unknown Event',
    risk: 'medium',
    description: `Event kind ${kind}`
  }
}

export function getEventRiskLevel(kind) {
  const info = getEventKindInfo(kind)
  return info.risk
}

export function getEventLabel(kind) {
  const info = getEventKindInfo(kind)
  return info.label
}

export function isHighRisk(kind) {
  return getEventRiskLevel(kind) === 'high'
}

export function isMediumRisk(kind) {
  return getEventRiskLevel(kind) === 'medium'
}
