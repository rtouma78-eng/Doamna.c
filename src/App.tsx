import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  serverTimestamp,
  getDocs,
  where,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  deleteDoc
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User
} from 'firebase/auth';
import { db, auth } from './firebase';
import { UserProfile, Post, Homework, Message } from './types';
import { 
  Home, 
  Users, 
  BookOpen, 
  MessageCircle, 
  User as UserIcon, 
  LogOut, 
  PlusSquare, 
  Heart, 
  MessageSquare, 
  Send,
  Image as ImageIcon,
  MoreVertical,
  Trash2,
  X,
  Calendar as CalendarIcon,
  Info,
  Bookmark,
  Share2,
  Upload
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';

// --- Utilities ---

const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1000;
        const MAX_HEIGHT = 1000;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        // Compress to JPEG with 0.6 quality to ensure it's well under 1MB
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);
        resolve(compressedBase64);
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// --- Components ---

const Navbar = ({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (t: string) => void }) => {
  const tabs = [
    { id: 'feed', icon: Home, label: 'Noutăți' },
    { id: 'classmates', icon: Users, label: 'Colegi' },
    { id: 'homework', icon: BookOpen, label: 'Teme' },
    { id: 'chat', icon: MessageCircle, label: 'Chat' },
    { id: 'profile', icon: UserIcon, label: 'Profil' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 flex justify-around items-center z-50 md:top-0 md:bottom-auto md:flex-col md:w-20 md:h-full md:border-r md:border-t-0">
      <div className="hidden md:block mb-8 mt-4">
        <h1 className="text-xl font-bold text-orange-600 italic">D.C</h1>
      </div>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`flex flex-col items-center p-2 rounded-lg transition-colors ${
            activeTab === tab.id ? 'text-orange-600 bg-orange-50' : 'text-gray-500 hover:text-orange-400'
          }`}
        >
          <tab.icon size={24} />
          <span className="text-[10px] mt-1 md:hidden">{tab.label}</span>
        </button>
      ))}
      <button 
        onClick={() => signOut(auth)}
        className="flex flex-col items-center p-2 text-gray-500 hover:text-red-500 mt-auto hidden md:flex"
      >
        <LogOut size={24} />
      </button>
    </nav>
  );
};

const Feed = ({ userProfile, setUserProfile }: { userProfile: UserProfile, setUserProfile: (p: UserProfile) => void }) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostImage, setNewPostImage] = useState('');
  const [showComments, setShowComments] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [comments, setComments] = useState<Record<string, any[]>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query(collection(db, 'posts'), orderBy('created_at', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const postsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post));
      setPosts(postsData);
    });
    return unsubscribe;
  }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file);
        setNewPostImage(compressed);
      } catch (error) {
        console.error("Error compressing image:", error);
        alert("Eroare la procesarea imaginii.");
      }
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPostContent.trim()) return;

    // Firestore document limit is 1MB. Base64 is ~33% larger than binary.
    // 800,000 characters is a safe limit for the entire document.
    if (newPostImage && newPostImage.length > 800000) {
      alert("Imaginea este prea mare chiar și după compresie. Te rugăm să alegi o altă imagine.");
      return;
    }

    try {
      await addDoc(collection(db, 'posts'), {
        userId: userProfile.uid,
        userName: userProfile.name,
        userPhoto: userProfile.photo || '',
        content: newPostContent,
        image: newPostImage,
        likes: [],
        created_at: serverTimestamp(),
      });
      setNewPostContent('');
      setNewPostImage('');
      setShowCreate(false);
    } catch (error) {
      console.error("Error creating post:", error);
      alert("Eroare la crearea postării. S-ar putea ca imaginea să fie prea mare.");
    }
  };

  const toggleLike = async (post: Post) => {
    const postRef = doc(db, 'posts', post.id);
    if (post.likes.includes(userProfile.uid)) {
      await updateDoc(postRef, { likes: arrayRemove(userProfile.uid) });
    } else {
      await updateDoc(postRef, { likes: arrayUnion(userProfile.uid) });
    }
  };

  const toggleSave = async (postId: string) => {
    const userRef = doc(db, 'users', userProfile.uid);
    const isSaved = userProfile.savedPosts?.includes(postId);
    
    if (isSaved) {
      await updateDoc(userRef, { savedPosts: arrayRemove(postId) });
      setUserProfile({ ...userProfile, savedPosts: userProfile.savedPosts.filter(id => id !== postId) });
    } else {
      await updateDoc(userRef, { savedPosts: arrayUnion(postId) });
      setUserProfile({ ...userProfile, savedPosts: [...(userProfile.savedPosts || []), postId] });
    }
  };

  const handleShare = async (post: Post) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Postare Doamna.C',
          text: post.content,
          url: window.location.href,
        });
      } catch (err) {
        console.error('Error sharing:', err);
      }
    } else {
      alert('Partajarea nu este suportată pe acest browser.');
    }
  };

  const deletePost = async (postId: string) => {
    if (window.confirm("Ștergi această postare?")) {
      await deleteDoc(doc(db, 'posts', postId));
    }
  };

  const loadComments = (postId: string) => {
    if (comments[postId]) return;
    const q = query(collection(db, `posts/${postId}/comments`), orderBy('created_at', 'asc'));
    onSnapshot(q, (snapshot) => {
      const commentsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setComments(prev => ({ ...prev, [postId]: commentsData }));
    });
  };

  const handleAddComment = async (postId: string) => {
    if (!commentText.trim()) return;
    await addDoc(collection(db, `posts/${postId}/comments`), {
      postId,
      userId: userProfile.uid,
      userName: userProfile.name,
      userPhoto: userProfile.photo || '',
      content: commentText,
      created_at: serverTimestamp(),
    });
    setCommentText('');
  };

  return (
    <div className="max-w-xl mx-auto pb-20 md:pt-4">
      <div className="flex justify-between items-center px-4 py-4 md:hidden">
        <h1 className="text-2xl font-bold italic text-orange-600">Doamna.C</h1>
        <button onClick={() => setShowCreate(true)} className="text-orange-600">
          <PlusSquare size={28} />
        </button>
      </div>

      <div className="hidden md:flex justify-between items-center mb-6 px-4">
        <h2 className="text-2xl font-bold">Noutăți</h2>
        <button 
          onClick={() => setShowCreate(true)}
          className="bg-orange-600 text-white px-4 py-2 rounded-full flex items-center gap-2 hover:bg-orange-700 transition"
        >
          <PlusSquare size={20} /> Creează Postare
        </button>
      </div>

      <AnimatePresence>
        {showCreate && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
          >
            <div className="bg-white rounded-2xl w-full max-w-md p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold">Postare Nouă</h3>
                <button onClick={() => setShowCreate(false)}><X /></button>
              </div>
              <form onSubmit={handleCreatePost}>
                <textarea
                  className="w-full border border-gray-200 rounded-xl p-3 focus:ring-2 focus:ring-orange-500 outline-none resize-none h-32"
                  placeholder="La ce te gândești?"
                  value={newPostContent}
                  onChange={(e) => setNewPostContent(e.target.value)}
                />
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-2 text-gray-500">
                    <ImageIcon size={20} />
                    <input 
                      type="text" 
                      placeholder="URL Imagine (opțional)" 
                      className="flex-1 text-sm outline-none"
                      value={newPostImage}
                      onChange={(e) => setNewPostImage(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-2 text-gray-500">
                    <Upload size={20} />
                    <button 
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-sm font-medium text-orange-600"
                    >
                      Încarcă din telefon
                    </button>
                    <input 
                      type="file" 
                      ref={fileInputRef}
                      className="hidden" 
                      accept="image/*"
                      onChange={handleImageUpload}
                    />
                  </div>
                  {newPostImage && (
                    <div className="relative w-20 h-20">
                      <img src={newPostImage} className="w-full h-full object-cover rounded-lg" alt="" />
                      <button 
                        type="button"
                        onClick={() => setNewPostImage('')}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}
                </div>
                <button 
                  type="submit"
                  className="w-full bg-orange-600 text-white py-3 rounded-xl mt-6 font-bold hover:bg-orange-700 transition"
                >
                  Postează
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-6">
        {posts.map((post) => (
          <motion.div 
            layout
            key={post.id} 
            className="bg-white border-b border-gray-100 md:border md:rounded-xl overflow-hidden"
          >
            <div className="flex items-center justify-between p-3">
              <div className="flex items-center gap-3">
                <img 
                  src={post.userPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.userName}`} 
                  alt="" 
                  className="w-10 h-10 rounded-full object-cover border border-gray-100"
                  referrerPolicy="no-referrer"
                />
                <div>
                  <p className="font-bold text-sm">{post.userName}</p>
                  <p className="text-xs text-gray-500">
                    {post.created_at ? formatDistanceToNow(post.created_at.toDate(), { addSuffix: true }) : 'acum'}
                  </p>
                </div>
              </div>
              {post.userId === userProfile.uid && (
                <button onClick={() => deletePost(post.id)} className="text-gray-400 hover:text-red-500">
                  <Trash2 size={18} />
                </button>
              )}
            </div>
            
            <div className="px-4 pb-3">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{post.content}</p>
            </div>

            {post.image && (
              <img 
                src={post.image} 
                alt="" 
                className="w-full aspect-square object-cover"
                referrerPolicy="no-referrer"
              />
            )}

            <div className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => toggleLike(post)}
                  className={`flex items-center gap-1 transition ${post.likes.includes(userProfile.uid) ? 'text-red-500' : 'text-gray-600 hover:text-red-400'}`}
                >
                  <Heart size={24} fill={post.likes.includes(userProfile.uid) ? 'currentColor' : 'none'} />
                  <span className="text-xs font-bold">{post.likes.length}</span>
                </button>
                <button 
                  onClick={() => {
                    setShowComments(showComments === post.id ? null : post.id);
                    if (showComments !== post.id) loadComments(post.id);
                  }}
                  className="text-gray-600 hover:text-orange-500 flex items-center gap-1"
                >
                  <MessageSquare size={24} />
                </button>
                <button 
                  onClick={() => handleShare(post)}
                  className="text-gray-600 hover:text-blue-500"
                >
                  <Share2 size={24} />
                </button>
              </div>
              <button 
                onClick={() => toggleSave(post.id)}
                className={`${userProfile.savedPosts?.includes(post.id) ? 'text-orange-600' : 'text-gray-600'} hover:text-orange-500`}
              >
                <Bookmark size={24} fill={userProfile.savedPosts?.includes(post.id) ? 'currentColor' : 'none'} />
              </button>
            </div>

            {showComments === post.id && (
              <div className="px-4 pb-4 border-t border-gray-50 pt-3">
                <div className="space-y-3 mb-4 max-h-40 overflow-y-auto">
                  {comments[post.id]?.map((c) => (
                    <div key={c.id} className="flex gap-2 items-start">
                      <img src={c.userPhoto} className="w-6 h-6 rounded-full" alt="" />
                      <div className="bg-gray-50 p-2 rounded-lg flex-1">
                        <p className="text-[10px] font-bold">{c.userName}</p>
                        <p className="text-xs">{c.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input 
                    className="flex-1 bg-gray-100 rounded-full px-3 py-1 text-xs outline-none"
                    placeholder="Adaugă un comentariu..."
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                  />
                  <button onClick={() => handleAddComment(post.id)} className="text-orange-600">
                    <Send size={18} />
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
};

const Classmates = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'users'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersData = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
      setUsers(usersData);
    });
    return unsubscribe;
  }, []);

  return (
    <div className="max-w-xl mx-auto p-4 pb-20">
      <div className="flex justify-between items-end mb-6">
        <h2 className="text-2xl font-bold">Colegi</h2>
        <p className="text-sm text-gray-500 font-medium">{users.length} studenți înregistrați</p>
      </div>
      <div className="grid grid-cols-1 gap-4">
        {users.map((u) => (
          <div 
            key={u.uid} 
            onClick={() => setSelectedUser(u)}
            className="bg-white p-4 rounded-2xl border border-gray-100 flex items-center gap-4 shadow-sm hover:shadow-md transition cursor-pointer"
          >
            <img 
              src={u.photo || `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.name}`} 
              alt="" 
              className="w-14 h-14 rounded-full object-cover border-2 border-orange-100"
              referrerPolicy="no-referrer"
            />
            <div className="flex-1">
              <p className="font-bold text-gray-900">{u.name}</p>
              <p className="text-xs text-gray-500 italic truncate max-w-[200px]">{u.bio || 'Fără bio'}</p>
            </div>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {selectedUser && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
            onClick={() => setSelectedUser(null)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl w-full max-w-sm p-8 text-center"
              onClick={e => e.stopPropagation()}
            >
              <img 
                src={selectedUser.photo || `https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedUser.name}`} 
                alt="" 
                className="w-32 h-32 rounded-full mx-auto mb-4 object-cover border-4 border-orange-50 shadow-lg"
                referrerPolicy="no-referrer"
              />
              <h3 className="text-2xl font-bold">{selectedUser.name}</h3>
              <div className="bg-gray-50 p-4 rounded-2xl text-sm text-gray-600 italic mt-4">
                {selectedUser.bio || "Acest utilizator nu a scris încă un bio."}
              </div>
              <button 
                onClick={() => setSelectedUser(null)}
                className="mt-8 w-full py-3 bg-gray-100 text-gray-600 font-bold rounded-xl hover:bg-gray-200 transition"
              >
                Închide
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const HomeworkSection = ({ userProfile }: { userProfile: UserProfile }) => {
  const [homework, setHomework] = useState<Homework[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newHw, setNewHw] = useState({ title: '', description: '', date: '' });

  useEffect(() => {
    const q = query(collection(db, 'homework'), orderBy('created_at', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const hwData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Homework));
      setHomework(hwData);
    });
    return unsubscribe;
  }, []);

  const handleAddHw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHw.title || !newHw.date) return;

    await addDoc(collection(db, 'homework'), {
      ...newHw,
      teacherName: userProfile.name,
      created_at: serverTimestamp()
    });
    setNewHw({ title: '', description: '', date: '' });
    setShowAdd(false);
  };

  return (
    <div className="max-w-xl mx-auto p-4 pb-20">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Teme</h2>
        <button onClick={() => setShowAdd(true)} className="bg-orange-600 text-white p-2 rounded-full hover:bg-orange-700 transition">
          <PlusSquare size={24} />
        </button>
      </div>

      <AnimatePresence>
        {showAdd && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
          >
            <div className="bg-white rounded-2xl w-full max-w-md p-6">
              <h3 className="text-xl font-bold mb-4">Adaugă Temă</h3>
              <form onSubmit={handleAddHw} className="space-y-4">
                <input 
                  className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-orange-500" 
                  placeholder="Titlu" 
                  value={newHw.title}
                  onChange={e => setNewHw({...newHw, title: e.target.value})}
                />
                <textarea 
                  className="w-full border p-3 rounded-xl h-32 outline-none focus:ring-2 focus:ring-orange-500" 
                  placeholder="Descriere detaliată (suportă Markdown)"
                  value={newHw.description}
                  onChange={e => setNewHw({...newHw, description: e.target.value})}
                />
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Data Limită</label>
                  <input 
                    type="date" 
                    className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-orange-500"
                    value={newHw.date}
                    onChange={e => setNewHw({...newHw, date: e.target.value})}
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button type="button" onClick={() => setShowAdd(false)} className="flex-1 py-3 border rounded-xl">Anulează</button>
                  <button type="submit" className="flex-1 py-3 bg-orange-600 text-white rounded-xl font-bold">Adaugă</button>
                </div>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-6">
        {homework.map((hw) => (
          <div key={hw.id} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-bold text-xl text-gray-900 mb-1">{hw.title}</h3>
                <div className="flex items-center gap-2 text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                  <UserIcon size={12} />
                  <span>Postat de {hw.teacherName}</span>
                </div>
              </div>
              <div className="flex flex-col items-end">
                <div className="bg-red-50 text-red-600 text-[10px] font-bold px-3 py-1 rounded-full uppercase flex items-center gap-1">
                  <CalendarIcon size={12} />
                  Limită: {hw.date}
                </div>
              </div>
            </div>
            <div className="prose prose-sm max-w-none text-gray-600 border-t border-gray-50 pt-4">
              <Markdown>{hw.description}</Markdown>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const Chat = ({ userProfile }: { userProfile: UserProfile }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query(collection(db, 'messages'), orderBy('created_at', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
      setMessages(msgs);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    await addDoc(collection(db, 'messages'), {
      senderId: userProfile.uid,
      senderName: userProfile.name,
      senderPhoto: userProfile.photo || '',
      text: newMessage,
      created_at: serverTimestamp()
    });
    setNewMessage('');
  };

  return (
    <div className="max-w-xl mx-auto h-[calc(100vh-120px)] flex flex-col md:h-screen md:pt-4">
      <div className="p-4 border-b bg-white/80 backdrop-blur-md sticky top-0 z-10">
        <h2 className="text-xl font-bold">Chat-ul Clasei</h2>
        <p className="text-xs text-gray-500">Toată lumea din clasă poate vedea asta</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.senderId === userProfile.uid ? 'flex-row-reverse' : ''}`}>
            <img 
              src={msg.senderPhoto || `https://api.dicebear.com/7.x/avataaars/svg?seed=${msg.senderName}`} 
              alt="" 
              className="w-8 h-8 rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
            <div className={`max-w-[75%] ${msg.senderId === userProfile.uid ? 'items-end' : 'items-start'} flex flex-col`}>
              <span className="text-[10px] text-gray-500 mb-1 px-1">{msg.senderName}</span>
              <div className={`p-3 rounded-2xl text-sm ${
                msg.senderId === userProfile.uid 
                ? 'bg-orange-600 text-white rounded-tr-none' 
                : 'bg-gray-100 text-gray-800 rounded-tl-none'
              }`}>
                {msg.text}
              </div>
              <span className="text-[8px] text-gray-400 mt-1">
                {msg.created_at ? formatDistanceToNow(msg.created_at.toDate(), { addSuffix: true }) : ''}
              </span>
            </div>
          </div>
        ))}
        <div ref={scrollRef} />
      </div>

      <form onSubmit={handleSend} className="p-4 bg-white border-t flex gap-2">
        <input 
          className="flex-1 bg-gray-100 rounded-full px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500" 
          placeholder="Scrie un mesaj..."
          value={newMessage}
          onChange={e => setNewMessage(e.target.value)}
        />
        <button type="submit" className="bg-orange-600 text-white p-2 rounded-full hover:bg-orange-700 transition">
          <Send size={20} />
        </button>
      </form>
    </div>
  );
};

const Profile = ({ userProfile, setUserProfile }: { userProfile: UserProfile, setUserProfile: (p: UserProfile) => void }) => {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(userProfile.name);
  const [bio, setBio] = useState(userProfile.bio || '');
  const [photo, setPhoto] = useState(userProfile.photo || '');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpdate = async () => {
    const userRef = doc(db, 'users', userProfile.uid);
    const updated = { ...userProfile, name, bio, photo };
    await updateDoc(userRef, { name, bio, photo });
    setUserProfile(updated);
    setEditing(false);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploading(true);
      try {
        const compressed = await compressImage(file);
        setPhoto(compressed);
      } catch (error) {
        console.error("Error uploading photo:", error);
        alert("Eroare la încărcarea fotografiei.");
      } finally {
        setUploading(false);
      }
    }
  };

  return (
    <div className="max-w-xl mx-auto p-6 pb-20">
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden mb-6">
        <div className="h-32 bg-gradient-to-r from-orange-400 to-orange-600"></div>
        <div className="px-6 pb-6 -mt-16 text-center">
          <div className="relative inline-block group">
            <img 
              src={photo || `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`} 
              alt="" 
              className="w-32 h-32 rounded-full object-cover border-4 border-white shadow-xl bg-white"
              referrerPolicy="no-referrer"
            />
            {editing && (
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 bg-orange-600 text-white p-2 rounded-full shadow-lg hover:bg-orange-700 transition-all border-2 border-white"
                disabled={uploading}
              >
                <Upload size={16} />
              </button>
            )}
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*" 
              onChange={handlePhotoUpload} 
            />
          </div>
          
          {!editing && (
            <div className="mt-4">
              <h2 className="text-2xl font-bold text-gray-900">{userProfile.name}</h2>
              <p className="text-orange-600 font-medium text-sm">Student</p>
            </div>
          )}
        </div>
      </div>

      {editing ? (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 space-y-4">
          <h3 className="text-lg font-bold mb-2">Editează Profilul</h3>
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Nume</label>
            <input className="w-full border p-3 rounded-xl mt-1 outline-none focus:ring-2 focus:ring-orange-500" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Bio</label>
            <textarea 
              className="w-full border p-3 rounded-xl mt-1 h-24 resize-none outline-none focus:ring-2 focus:ring-orange-500" 
              placeholder="Spune-ne ceva despre tine..."
              value={bio} 
              onChange={e => setBio(e.target.value)} 
            />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Sau URL Fotografie</label>
            <input className="w-full border p-3 rounded-xl mt-1 outline-none focus:ring-2 focus:ring-orange-500" value={photo} onChange={e => setPhoto(e.target.value)} />
          </div>
          <div className="flex gap-2 pt-4">
            <button onClick={() => setEditing(false)} className="flex-1 py-3 border rounded-xl hover:bg-gray-50 transition">Anulează</button>
            <button onClick={handleUpdate} className="flex-1 py-3 bg-orange-600 text-white rounded-xl font-bold hover:bg-orange-700 transition">Salvează</button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Despre mine</h3>
            <p className="text-gray-700 leading-relaxed">
              {userProfile.bio || 'Acest utilizator nu a scris încă un bio. Editează-ți profilul pentru a adăuga unul!'}
            </p>
          </div>
          
          <div className="pt-4 space-y-3">
            <button 
              onClick={() => setEditing(true)}
              className="w-full py-4 bg-white border border-gray-200 rounded-2xl font-bold text-gray-700 hover:bg-gray-50 transition shadow-sm flex items-center justify-center gap-2"
            >
              Editează Profilul
            </button>
            <button 
              onClick={() => signOut(auth)}
              className="w-full py-4 text-red-500 font-bold hover:bg-red-50 rounded-2xl transition flex items-center justify-center gap-2"
            >
              <LogOut size={20} /> Deconectare
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const WelcomeModal = ({ userProfile, setUserProfile, onClose }: { userProfile: UserProfile, setUserProfile: (p: UserProfile) => void, onClose: () => void }) => {
  const [name, setName] = useState(userProfile.name);
  const [photo, setPhoto] = useState(userProfile.photo || '');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    const userRef = doc(db, 'users', userProfile.uid);
    await updateDoc(userRef, { name, photo });
    setUserProfile({ ...userProfile, name, photo });
    onClose();
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploading(true);
      try {
        const compressed = await compressImage(file);
        setPhoto(compressed);
      } catch (error) {
        console.error("Error uploading photo:", error);
      } finally {
        setUploading(false);
      }
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm"
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
        className="bg-white rounded-3xl w-full max-w-md p-8 text-center shadow-2xl"
      >
        <h2 className="text-3xl font-black italic text-orange-600 mb-2">Bun venit!</h2>
        <p className="text-gray-500 mb-8">Configurează-ți profilul pentru a începe.</p>
        
        <div className="relative inline-block mb-8 group">
          <img 
            src={photo || `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`} 
            alt="" 
            className="w-32 h-32 rounded-full object-cover border-4 border-orange-100 shadow-lg"
            referrerPolicy="no-referrer"
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="absolute bottom-0 right-0 bg-orange-600 text-white p-2 rounded-full shadow-lg hover:bg-orange-700 transition-all border-2 border-white"
            disabled={uploading}
          >
            <Upload size={16} />
          </button>
          <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handlePhotoUpload} />
        </div>

        <div className="space-y-4 text-left mb-8">
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Cum te numesc colegii?</label>
            <input 
              className="w-full border p-4 rounded-2xl mt-2 outline-none focus:ring-2 focus:ring-orange-500 bg-gray-50" 
              value={name} 
              onChange={e => setName(e.target.value)} 
              placeholder="Numele tău"
            />
          </div>
        </div>

        <button 
          onClick={handleSave}
          className="w-full py-4 bg-orange-600 text-white rounded-2xl font-bold text-lg shadow-lg hover:bg-orange-700 transition-all transform hover:-translate-y-1"
        >
          Începe aventura
        </button>
      </motion.div>
    </motion.div>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('feed');
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const userDoc = await getDoc(doc(db, 'users', u.uid));
        if (userDoc.exists()) {
          setUserProfile({ uid: u.uid, ...userDoc.data() } as UserProfile);
        } else {
          // New user setup
          const newProfile: UserProfile = {
            uid: u.uid,
            name: u.displayName || 'Student',
            photo: u.photoURL || '',
            bio: '',
            savedPosts: [],
            created_at: serverTimestamp()
          };
          await setDoc(doc(db, 'users', u.uid), newProfile);
          setUserProfile(newProfile);
          setShowWelcome(true);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-orange-50">
        <motion.div 
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="text-4xl font-bold italic text-orange-600"
        >
          Doamna.C
        </motion.div>
      </div>
    );
  }

  if (!user || !userProfile) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-orange-50 p-6 text-center">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-sm"
        >
          <h1 className="text-5xl font-black italic text-orange-600 mb-4">Doamna.C</h1>
          <p className="text-gray-600 mb-10 leading-relaxed">
            Bun venit pe rețeaua socială a școlii tale. Conectează-te cu colegii, partajează postări și fii la curent cu temele.
          </p>
          <button 
            onClick={handleLogin}
            className="w-full bg-white text-gray-800 font-bold py-4 rounded-2xl shadow-xl flex items-center justify-center gap-3 hover:shadow-2xl transition-all border border-orange-100"
          >
            <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="" />
            Conectează-te cu Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 md:pl-20">
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <AnimatePresence>
        {showWelcome && (
          <WelcomeModal 
            userProfile={userProfile} 
            setUserProfile={setUserProfile} 
            onClose={() => setShowWelcome(false)} 
          />
        )}
      </AnimatePresence>

      <main className="pb-20 md:pb-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'feed' && <Feed userProfile={userProfile} setUserProfile={setUserProfile} />}
            {activeTab === 'classmates' && <Classmates />}
            {activeTab === 'homework' && <HomeworkSection userProfile={userProfile} />}
            {activeTab === 'chat' && <Chat userProfile={userProfile} />}
            {activeTab === 'profile' && <Profile userProfile={userProfile} setUserProfile={setUserProfile} />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
