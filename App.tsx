import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, ActivityIndicator, Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import PhoneLoginScreen from './screens/PhoneLoginScreen';
import ChatRoomScreen from './screens/ChatRoomScreen';
import RoomListScreen from './screens/RoomListScreen';
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

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);

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
        
        // Even if we've requested before, let's check the current status on Android
        // to make sure permissions didn't get revoked
        if (Platform.OS === 'android') {
          const cameraStatus = (await ImagePicker.getCameraPermissionsAsync()).status;
          const mediaLibraryStatus = (await ImagePicker.getMediaLibraryPermissionsAsync()).status;
          const mediaLibraryWriteStatus = (await MediaLibrary.getPermissionsAsync()).status;
          
          console.log('Current permission status on Android:');
          console.log(`- Camera: ${cameraStatus}`);
          console.log(`- Media Library: ${mediaLibraryStatus}`);
          console.log(`- Media Library Write: ${mediaLibraryWriteStatus}`);
          
          // If any permissions are missing, request them again
          if (cameraStatus !== 'granted' || 
              mediaLibraryStatus !== 'granted' || 
              mediaLibraryWriteStatus !== 'granted') {
            console.log('Some permissions are not granted, requesting again...');
            // Continue to permission requests below
          } else {
            return; // All permissions are already granted
          }
        } else {
          return; // On iOS, we trust that permissions were previously requested
        }
      }
      
      console.log('Requesting app permissions');
      
      // Request camera permissions
      const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
      console.log('Camera permission:', cameraPermission.status);
      
      // Request media library permissions
      const mediaLibraryPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      console.log('Media library permission:', mediaLibraryPermission.status);
      
      // Request media library write permissions (needed for saving images on Android)
      if (Platform.OS === 'android') {
        // On Android, we need to be more explicit about requesting write permissions
        const mediaLibraryWritePermission = await MediaLibrary.requestPermissionsAsync(true);
        console.log('Media library write permission:', mediaLibraryWritePermission.status);
        
        // Force a small delay on Android to make sure permissions are registered
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Mark permissions as requested so we don't ask again
      await savePermissionsRequested(true);
      
      if (Platform.OS === 'android') {
        // Double-check that permissions were actually granted on Android
        const finalCameraStatus = (await ImagePicker.getCameraPermissionsAsync()).status;
        const finalMediaLibraryStatus = (await ImagePicker.getMediaLibraryPermissionsAsync()).status;
        const finalMediaLibraryWriteStatus = (await MediaLibrary.getPermissionsAsync()).status;
        
        console.log('Final permission status on Android:');
        console.log(`- Camera: ${finalCameraStatus}`);
        console.log(`- Media Library: ${finalMediaLibraryStatus}`);
        console.log(`- Media Library Write: ${finalMediaLibraryWriteStatus}`);
      }
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

  // Show loading indicator while checking for stored user data
  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#0070f3" />
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

    return (
      <RoomListScreen 
        user={user}
        onSelectRoom={handleRoomJoined}
        onCreateRoom={() => {}} // Empty function since we handle creation in RoomListScreen
        onLogout={handleLogout}
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
