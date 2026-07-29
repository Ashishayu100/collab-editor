export type Role = 'VIEWER' | 'EDITOR' | 'OWNER';

export interface User {
  id: string;
  email: string;
  name: string;
  avatarColor: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  avatarColor: string;
}

export interface Document {
  id: string;
  title: string;
  ownerId: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Collaborator {
  id: string;
  documentId: string;
  userId: string;
  role: Role;
  addedAt: string;
}

export interface DocumentVersion {
  id: string;
  documentId: string;
  title: string;
  createdBy: string;
  createdAt: string;
}

export interface CommentSelection {
  from: number;
  to: number;
}

export interface Comment {
  id: string;
  documentId: string;
  userId: string;
  content: string;
  selection: CommentSelection | null;
  parentId: string | null;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

export interface SignupPayload {
  email: string;
  name: string;
  password: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface ApiErrorShape {
  error: {
    message: string;
    statusCode: number;
  };
}
