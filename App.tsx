import React, { useState, useEffect, createContext, useContext, lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import useLocalStorage from './hooks/useLocalStorage';
import { User, Group, Message, Chat, ActiveCallType } from './types';
import { deleteUserByName } from './services/userService'; // Import the new function
import * as userService from './services/userService';
import { getCurrentLocation } from './services/locationService';
import { startLocalMedia, stopLocalMedia, MediaStreamAndTracks } from './services/rtcService';
import { askAI } from './services/geminiService';

// Lazy load components that aren't needed immediately
const AuthPage = lazy(() => import('./pages/AuthPage'));
const MainLayout = lazy(() => import('./pages/MainLayout'));
const ChatWindow = lazy(() => import('./pages/ChatWindow'));
const GroupMapPage = lazy(() => import('./pages/GroupMapPage'));

interface AppContextType {
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  groups: Group[];
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  activeChat: Chat | null;
  setActiveChat: (chat: Chat | null) => void;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  sendMessage: (content: string, type?: 'text' | 'location' | 'ai_query') => Promise<void>;
  shareLocation: () => Promise<void>;
  initiateCall: (type: ActiveCallType.VOICE | ActiveCallType.VIDEO) => Promise<void>;
  endCall: () => void;
  activeCallType: ActiveCallType;
  localMediaStream: MediaStream | null;
  isCallViewVisible: boolean;
  setIsCallViewVisible: React.Dispatch<React.SetStateAction<boolean>>;
  isLoadingAI: boolean;
}

const AppContext = createContext<AppContextType | null>(null);

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within an AppProvider');
  return context;
};

const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notificationPermission, setNotificationPermission] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'default');
  const [lastNotifiedMessageId, setLastNotifiedMessageId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useLocalStorage<User | null>('roip_currentUser', null);
  const [users, setUsers] = useState<User[]>(userService.getUsers());
  const [groups, setGroups] = useState<Group[]>(userService.getGroups());
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  
  const [activeCallType, setActiveCallType] = useState<ActiveCallType>(ActiveCallType.NONE);
  const [localMediaStreamAndTracks, setLocalMediaStreamAndTracks] = useState<MediaStreamAndTracks | null>(null);
  const [isCallViewVisible, setIsCallViewVisible] = useState(false);
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  
  const localMediaStream = localMediaStreamAndTracks?.stream || null;

  useEffect(() => {
    if (activeChat) {
      setMessages(userService.getMessages(activeChat.id));
    } else {
      setMessages([]);
    }
  }, [activeChat]);
  
  useEffect(() => {
    // Update user's online status (simulated)
    if (currentUser) {
      setUsers((prevUsers: User[]) => prevUsers.map((u: User) => u.id === currentUser!.id ? {...u, isOnline: true} : u));
    }
    // Could add a beforeunload listener to set offline, but that's more complex for this sim
  }, [currentUser, setUsers]);

  useEffect(() => {
    if (typeof Notification !== 'undefined' && notificationPermission === 'default') {
      Notification.requestPermission().then(permission => {
        setNotificationPermission(permission);
      });
    }
  }, [notificationPermission]);

  useEffect(() => {
    if (notificationPermission === 'granted' && currentUser && activeChat && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];

      if (lastMessage && lastMessage.id !== lastNotifiedMessageId && lastMessage.senderId !== currentUser.id) {
        if (document.hidden) { // Only notify if tab is not active
          const chatPartner = activeChat.type === 'user'
            ? users.find((u: User) => u.id === activeChat.targetId)
            : groups.find((g: Group) => g.id === activeChat.targetId);
          
          const title = chatPartner 
            ? `Nouveau message de ${chatPartner.name}` 
            : (activeChat.type === 'group' ? `Nouveau message dans ${activeChat.name}` : 'Nouveau message');
          
          let body = lastMessage.content;
          if (lastMessage.type === 'location') body = 'Coordonnées GPS partagées';
          else if (lastMessage.type === 'ai_query') body = 'Question posée à l\u0027IA';
          else if (lastMessage.type === 'ai_response') body = 'Réponse de l\u0027IA reçue';
          
          if (body.length > 100) body = body.substring(0, 97) + "...";

          try {
            const notification = new Notification(title, {
              body: body,
              icon: '/logo_pc.png', // Assurez-vous que ce fichier existe dans votre dossier public
              tag: lastMessage.id, // Empêche les notifications multiples pour le même message
            });
            notification.onclick = () => {
              window.focus(); // Mettre la fenêtre au premier plan
              // Optionnel: naviguer vers le chat concerné si ce n'est pas déjà le cas
              // Cela nécessiterait d'injecter `navigate` ici ou de gérer via un état global
            };
          } catch (e) {
            console.error("Erreur lors de l'affichage de la notification:", e);
          }
          setLastNotifiedMessageId(lastMessage.id);
        }
      }
    }
  }, [messages, activeChat, currentUser, notificationPermission, users, groups, lastNotifiedMessageId]);

  // Réinitialiser lastNotifiedMessageId lorsque le chat actif change pour éviter de notifier les anciens messages
  useEffect(() => {
    setLastNotifiedMessageId(null);
  }, [activeChat]);

  // Initial data load and one-time operations
  useEffect(() => {
    // TEMPORARY: Delete a specific user on app load
    // Make sure to remove this after one successful run
    const userToDelete = 'boutrikmohamed8@gmail.com';
    const wasDeleted = deleteUserByName(userToDelete);
    if (wasDeleted) {
      console.log(`TEMPORARY: Attempted to delete user ${userToDelete}. Please verify and remove this code block from App.tsx.`);
      // Re-fetch users from storage after deletion to update the state
      setUsers(userService.getUsers()); 
      setGroups(userService.getGroups()); // Also refresh groups in case user was removed from them
    } else {
      console.log(`TEMPORARY: User ${userToDelete} not found for deletion or already deleted. Please verify and remove this code block from App.tsx.`);
      // Still load initial users and groups if not deleted or already gone
      if (users.length === 0) setUsers(userService.getUsers());
      if (groups.length === 0) setGroups(userService.getGroups());
    }
    // END TEMPORARY

    // Request notification permission on load
    if (Notification.permission === 'default') {
      Notification.requestPermission().then(setNotificationPermission);
    }
  }, []); // Empty dependency array ensures this runs only once on mount

  const sendMessage = async (content: string, type: 'text' | 'location' | 'ai_query' = 'text') => {
    if (!currentUser || !activeChat) return;

    const newMessage: Message = {
      id: Date.now().toString(),
      chatId: activeChat.id,
      senderId: currentUser.id,
      senderName: currentUser.name,
      content,
      timestamp: Date.now(),
      type: type,
    };
    const updatedMessages = userService.addMessage(activeChat.id, newMessage);
    setMessages(updatedMessages);

    if (type === 'ai_query') {
      setIsLoadingAI(true);
      const aiResponse = await askAI(content, currentUser);
      if (aiResponse) {
        const updatedAiMessages = userService.addMessage(activeChat.id, aiResponse);
        setMessages(updatedAiMessages);
      }
      setIsLoadingAI(false);
    }
  };
  
  const shareLocation = async () => {
    if (!currentUser || !activeChat) return;
    try {
      const coords = await getCurrentLocation();
      const locationString = `Location: ${coords.latitude}, ${coords.longitude}`;
      await sendMessage(locationString, 'location');
      
      // Update current user's location in users list
      const updatedUser = { ...currentUser, lastKnownLocation: coords };
      setCurrentUser(updatedUser); // Update current user in context/localStorage
      setUsers(() => userService.updateUser(updatedUser)); // Update in global user list
      
    } catch (error) {
      console.error("Error sharing location:", error);
      let userFriendlyMessage = "Une erreur inconnue est survenue lors du partage de la position.";

      if (typeof error === 'object' && error !== null) {
        // Check if it resembles GeolocationPositionError (which might not be an `instanceof Error` in all environments)
        if ('code' in error && 'message' in error) {
          const geoError = error as GeolocationPositionError; // More flexible check
          switch (geoError.code) {
            case 1: // PERMISSION_DENIED
              userFriendlyMessage = "Permission de géolocalisation refusée par l'utilisateur.";
              break;
            case 2: // POSITION_UNAVAILABLE
              userFriendlyMessage = "Information de position non disponible.";
              break;
            case 3: // TIMEOUT
              userFriendlyMessage = "La demande de position a expiré.";
              break;
            default:
              userFriendlyMessage = `Erreur de géolocalisation: ${geoError.message || 'Inconnue'} (code ${geoError.code}).`;
          }
        } else if (error instanceof Error) {
          userFriendlyMessage = error.message;
        } else {
           // Attempt to get a string representation if it's some other object
           try {
             userFriendlyMessage = String(error);
             // Prevent showing "[object Object]" directly if String(error) results in that
             if (userFriendlyMessage.toLowerCase() === '[object object]') {
                 userFriendlyMessage = "Détails de l'erreur non disponibles.";
             }
           } catch {
                userFriendlyMessage = "Détails de l'erreur non disponibles (conversion en chaîne impossible).";
           }
        }
      } else if (typeof error === 'string') {
        userFriendlyMessage = error;
      }
      
      await sendMessage(`Impossible de partager la position: ${userFriendlyMessage}`, 'text');
    }
  };

  const initiateCall = async (callType: ActiveCallType.VOICE | ActiveCallType.VIDEO) => {
    if (!activeChat) return;
    try {
      // For simulation, just get local media and show it.
      const media = await startLocalMedia(null, callType === ActiveCallType.VOICE);
      setLocalMediaStreamAndTracks(media);
      setActiveCallType(callType);
      setIsCallViewVisible(true); // Show the call UI
      // In a real app, signaling to the other peer would happen here.
      sendMessage(`Appel ${callType === ActiveCallType.VIDEO ? 'vidéo' : 'vocal'} démarré (simulation).`, 'text');
    } catch (error) {
      console.error(`Error starting ${callType} call:`, error);
      sendMessage(`Impossible de démarrer l'appel ${callType === ActiveCallType.VIDEO ? 'vidéo' : 'vocal'}.`, 'text');
    }
  };

  const endCall = () => {
    stopLocalMedia();
    setLocalMediaStreamAndTracks(null);
    setActiveCallType(ActiveCallType.NONE);
    setIsCallViewVisible(false);
    if (activeChat) {
      sendMessage("Appel terminé (simulation).", 'text');
    }
  };


  return (
    <AppContext.Provider value={{ 
      currentUser, setCurrentUser, 
      users, setUsers,
      groups, setGroups,
      activeChat, setActiveChat,
      messages, setMessages,
      sendMessage, shareLocation,
      initiateCall, endCall, activeCallType, localMediaStream,
      isCallViewVisible, setIsCallViewVisible,
      isLoadingAI
    }}>
      {children}
    </AppContext.Provider>
  );
};


const AppRoutes: React.FC = () => {
  const { currentUser, activeChat } = useAppContext();

  // Loading fallback for lazy-loaded components
  const loadingFallback = (
    <div className="flex items-center justify-center h-full">
      <div className="text-primary-light text-lg">Chargement...</div>
    </div>
  );

  if (!currentUser) {
    return (
      <Suspense fallback={loadingFallback}>
        <Routes>
          <Route path="/auth" element={<AuthPage />} />
          <Route path="*" element={<Navigate to="/auth" replace />} />
        </Routes>
      </Suspense>
    );
  }
  
  return (
    <Suspense fallback={loadingFallback}>
      <MainLayout>
        <Routes>
          <Route path="/" element={
              activeChat ? <Navigate to={`/chat/${activeChat.type}/${activeChat.targetId}`} replace /> : <WelcomeScreen />
            } 
          />
          <Route path="/chat/:type/:id" element={<ChatWindow />} />
          <Route path="/group/:groupId/map" element={<GroupMapPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </MainLayout>
    </Suspense>
  );
};

const WelcomeScreen: React.FC = () => (
  <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-neutral-800 rounded-lg">
    <img src="https://picsum.photos/seed/civilprotection/300/200" alt="Protection Civile" className="rounded-lg mb-6 shadow-lg" />
    <h1 className="text-3xl font-bold text-primary-light mb-2">Bienvenue sur ROIP Chat</h1>
    <p className="text-neutral-300 mb-6">Sélectionnez un utilisateur ou un groupe pour commencer à discuter.</p>
    <p className="text-sm text-neutral-400">Utilisez le menu de gauche pour naviguer.</p>
  </div>
);


const App: React.FC = () => {
  return (
    <AppProvider>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </AppProvider>
  );
};

export default App;
