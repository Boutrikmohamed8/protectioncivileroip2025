
export interface User {
  id: string;
  name: string;
  password?: string; // Added for authentication
  isOnline?: boolean; // Presence simulation
  lastKnownLocation?: GeolocationCoordinates;
}

export interface Group {
  id: string;
  name: string;
  members: string[]; // Array of user IDs
  creatorId: string;
}

export enum MessageSender {
  USER = 'user',
  PEER = 'peer',
  SYSTEM = 'system',
  AI = 'ai',
}

export interface Message {
  id: string;
  chatId: string; // Can be userId for 1-1 chat, or groupId for group chat
  senderId: string; // 'currentUser', 'peerUserId', 'AI', 'SYSTEM'
  senderName: string; 
  content: string;
  timestamp: number;
  type: 'text' | 'location' | 'ai_query' | 'ai_response';
}

export interface Chat {
  id: string; // For 1-1, could be composite ID like `user1_user2`. For group, `groupId`.
  type: 'user' | 'group';
  name: string; // User name or group name
  targetId: string; // The ID of the other user or the group
  unreadCount?: number;
  lastMessage?: string;
  avatarSeed?: string; // for generating consistent avatars
}

// Geolocation API's Coordinates interface structure
export interface GeolocationCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number | null;
  altitudeAccuracy: number | null;
  heading: number | null;
  speed: number | null;
}

export enum ActiveCallType {
  NONE,
  VIDEO,
  VOICE
}