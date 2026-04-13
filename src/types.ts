export interface UserProfile {
  uid: string;
  name: string;
  photo?: string;
  bio?: string;
  savedPosts: string[];
  created_at: any;
}

export interface Post {
  id: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  content: string;
  image?: string;
  likes: string[];
  created_at: any;
}

export interface Comment {
  id: string;
  postId: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  content: string;
  created_at: any;
}

export interface Homework {
  id: string;
  title: string;
  description: string;
  date: string;
  teacherName: string;
  created_at: any;
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderPhoto?: string;
  text: string;
  created_at: any;
}
