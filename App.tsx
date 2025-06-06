import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, ActivityIndicator, Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import PhoneLoginScreen from './screens/PhoneLoginScreen';
import ChatRoomScreen from './screens/ChatRoomScreen';
import RoomListScreen from './screens/RoomListScreen';
import ProfileScreen from './screens/ProfileScreen';
import ActivityScreen from './screens/ActivityScreen';
import { Room, User, createUser, getUserByUsername, leaveRoom } from './lib/supabase';
import { 
  getUserName, 
  saveUserName, 
  getCurrentRoom, 
  saveCurrentRoom, 
  clearCurrentRoom, 
  getUserData, 
  saveUserData,
  getPermissionsRequested,
  savePermissionsRequested,
  clearUserData
} from './lib/storage';
import { initImageCache, clearExpiredImageCaches } from './lib/imageUtils';

// Define app colors - based on deep navy blue #1A2C50
const COLORS = {
  primary: '#1A2C50', // Deep navy blue
  secondary: '#4A6FA5', // Medium blue
  accent: '#6B98D4', // Light blue
  highlight: '#F0B429', // Gold accent
  lightBg: '#E6EBF5', // Light background
  white: '#FFFFFF',
  black: '#000000',
  gray: '#6B7280',
  lightGray: '#E5E7EB',
  border: '#D1D5DB',
  background: '#F9FAFB',
  text: '#1F2937', // Dark text color
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [showProfile, setShowProfile] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [currentTab, setCurrentTab] = useState('home');
  const [activities, setActivities] = useState<any[]>([]);

  // Request all necessary permissions and initialize systems
  const initializeApp = async () => {
    try {
      // Initialize image caching system
      await initImageCache();
      
      // Clear expired image caches
      await clearExpiredImageCaches();
      
      // Check if we've already requested permissions
      const permissionsRequested = await getPermissionsRequested();
      
      if (permissionsRequested) {
        console.log('Permissions were previously requested');
        return; // Don't ask again if we've already requested
      }
      
      console.log('Requesting app permissions');
      
      // Request all permissions at once to avoid multiple prompts later
      
      // Camera permissions
      await ImagePicker.requestCameraPermissionsAsync();
      
      // Media library permissions
      await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      // Media library write permissions (needed for saving images)
      await MediaLibrary.requestPermissionsAsync();
      
      // Mark permissions as requested so we don't ask again
      await savePermissionsRequested(true);
    } catch (error) {
      console.error('Error initializing app:', error);
    }
  };

  // Load user data from AsyncStorage when app starts
  useEffect(() => {
    const loadStoredData = async () => {
      try {
        // Initialize app systems and request permissions
        await initializeApp();
        
        // First try to load full user data
        const storedUserData = await getUserData();
        
        if (storedUserData && storedUserData.id) {
          setUser(storedUserData);
          
          // If we have full user data, check if they were in a room
          const storedRoom = await getCurrentRoom();
          if (storedRoom) {
            setCurrentRoom(storedRoom);
          }
        } else {
          // Fall back to just the username for backward compatibility
          const storedUserName = await getUserName();
          
          if (storedUserName) {
            // Try to get full user data from the database
            const dbUser = await getUserByUsername(storedUserName);
            
            if (dbUser) {
              // Save the full user data for future use
              await saveUserData(dbUser);
              setUser(dbUser);
              
              // Check if they were in a room
              const storedRoom = await getCurrentRoom();
              if (storedRoom) {
                setCurrentRoom(storedRoom);
              }
            } else {
              // Just create a user object with the username
              setUser({ username: storedUserName });
            }
          }
        }
      } catch (error) {
        console.error('Error loading stored data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadStoredData();
  }, []);

  // Load mock activity data
  useEffect(() => {
    // In a real app, this would fetch from an API
    // For now, we'll use mock data
    const mockActivities = [
      {
        id: '1',
        type: 'join',
        username: 'Liam',
        timestamp: new Date().toISOString(),
        timeDisplay: '10:30 AM',
      },
      {
        id: '2',
        type: 'upload',
        username: 'Sophia',
        timestamp: new Date().toISOString(),
        timeDisplay: '11:15 AM',
        photoCount: 3,
      },
      {
        id: '3',
        type: 'join',
        username: 'Ethan',
        timestamp: new Date().toISOString(),
        timeDisplay: '12:00 PM',
      },
      {
        id: '4',
        type: 'upload',
        username: 'Olivia',
        timestamp: new Date().toISOString(),
        timeDisplay: '12:45 PM',
        photoCount: 2,
      },
      {
        id: '5',
        type: 'create',
        username: 'Noah',
        timestamp: new Date(Date.now() - 86400000).toISOString(), // Yesterday
        timeDisplay: '9:00 AM',
      },
      {
        id: '6',
        type: 'join',
        username: 'Ava',
        timestamp: new Date(Date.now() - 86400000).toISOString(), // Yesterday
        timeDisplay: '9:30 AM',
      },
      {
        id: '7',
        type: 'upload',
        username: 'Lucas',
        timestamp: new Date(Date.now() - 86400000).toISOString(), // Yesterday
        timeDisplay: '10:00 AM',
        photoCount: 5,
      },
      {
        id: '8',
        type: 'join',
        username: 'Isabella',
        timestamp: new Date(Date.now() - 86400000).toISOString(), // Yesterday
        timeDisplay: '11:00 AM',
      },
    ];
    
    setActivities(mockActivities);
  }, []);

  const handleUserCreated = async (name: string) => {
    try {
      // First check if user exists
      let dbUser = await getUserByUsername(name);
      
      // If not, create the user
      if (!dbUser) {
        dbUser = await createUser(name);
        if (!dbUser) {
          throw new Error('Failed to create user');
        }
      }
      
      // Save full user data
      await saveUserData(dbUser);
      setUser(dbUser);
      
      // Request permissions when user logs in (if not already requested)
      initializeApp();
    } catch (error) {
      console.error('Error handling user creation:', error);
      // Fallback to just username
      setUser({ username: name });
      await saveUserName(name);
    }
  };

  const handleRoomJoined = async (room: Room) => {
    setCurrentRoom(room);
    await saveCurrentRoom(room);
  };

  const handleExitRoom = async (shouldLeaveRoom = false) => {
    if (shouldLeaveRoom && user && user.id && currentRoom) {
      try {
        // If we're actually leaving the room (not just navigating back), remove membership
        await leaveRoom(user.id, currentRoom.id);
        console.log(`User ${user.username} left room ${currentRoom.id}`);
      } catch (error) {
        console.error('Error leaving room:', error);
        // Continue even if there's an error
      }
    }
    
    // Always clear current room and go back to room list
    setCurrentRoom(null);
    setCurrentTab('home'); // Ensure we're on the home tab
    await clearCurrentRoom();
  };

  const handleLogout = async () => {
    try {
      // Clear all user data from storage
      await clearUserData();
      
      // Reset app state
      setUser(null);
      setCurrentRoom(null);
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };

  // Handle navigation between tabs
  const handleNavigateToTab = (tab: string) => {
    setCurrentTab(tab);
    
    if (tab === 'profile') {
      setShowProfile(true);
      setShowActivity(false);
    } else if (tab === 'notifications') {
      setShowActivity(true);
      setShowProfile(false);
    } else if (tab === 'home') {
      setShowProfile(false);
      setShowActivity(false);
    }
  };

  // Handle back navigation from profile
  const handleBackFromProfile = () => {
    setShowProfile(false);
  };

  // Handle back navigation from activity
  const handleBackFromActivity = () => {
    setShowActivity(false);
  };

  // Show loading indicator while checking for stored user data
  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // Determine which screen to show
  const renderScreen = () => {
    if (!user) {
      return (
        <PhoneLoginScreen
          onUserCreated={handleUserCreated} 
        />
      );
    }

    if (currentRoom) {
      return (
        <ChatRoomScreen 
          room={currentRoom} 
          userName={user.username}
          userId={user.id}
          onExit={handleExitRoom} 
        />
      );
    }

    if (showProfile) {
      return (
        <ProfileScreen 
          user={user}
          onBack={handleBackFromProfile}
          onLogout={handleLogout}
          onNavigateToTab={handleNavigateToTab}
        />
      );
    }

    if (showActivity) {
      return (
        <ActivityScreen 
          onBack={handleBackFromActivity}
          activities={activities}
        />
      );
    }

    return (
      <RoomListScreen 
        user={user}
        onSelectRoom={handleRoomJoined}
        onCreateRoom={() => {}} // Empty function since we handle creation in RoomListScreen
        onLogout={handleLogout}
        onNavigateToTab={handleNavigateToTab}
      />
    );
  };

  return (
    <View style={styles.container}>
      {renderScreen()}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
