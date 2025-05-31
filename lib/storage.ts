import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, Room, RoomImage } from './supabase';

// Keys for storage
const STORAGE_KEYS = {
  USER_DATA: 'user_data',
  USER_NAME: 'user_name',
  CURRENT_ROOM: 'current_room',
  RECENT_ROOMS: 'recent_rooms',
  PERMISSIONS_REQUESTED: 'permissions_requested',
  IMAGE_CACHE: 'image_cache',
  IMAGE_CACHE_TIMESTAMP: 'image_cache_timestamp',
  ROOM_IMAGES_CACHE: 'room_images_cache'
};

// Cache expiration in milliseconds (7 days)
const CACHE_EXPIRATION = 7 * 24 * 60 * 60 * 1000;

// Interface for cached image data
interface CachedImage {
  url: string;
  cachedPath?: string;
  timestamp: number;
  width?: number;
  height?: number;
  hash?: string;
}

// Interface for room images cache
interface RoomImagesCache {
  roomId: string;
  images: CachedImage[];
  lastUpdated: number;
}

// Save full user data to persistent storage
export const saveUserData = async (userData: User): Promise<boolean> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(userData));
    // Also save username for backward compatibility
    await AsyncStorage.setItem(STORAGE_KEYS.USER_NAME, userData.username);
    return true;
  } catch (error) {
    console.error('Error saving user data:', error);
    return false;
  }
};

// Get user data from persistent storage
export const getUserData = async (): Promise<User | null> => {
  try {
    const userData = await AsyncStorage.getItem(STORAGE_KEYS.USER_DATA);
    return userData ? JSON.parse(userData) : null;
  } catch (error) {
    console.error('Error getting user data:', error);
    return null;
  }
};

// Save user name to persistent storage (legacy)
export const saveUserName = async (userName: string): Promise<boolean> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.USER_NAME, userName);
    return true;
  } catch (error) {
    console.error('Error saving user name:', error);
    return false;
  }
};

// Get user name from persistent storage
export const getUserName = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(STORAGE_KEYS.USER_NAME);
  } catch (error) {
    console.error('Error getting user name:', error);
    return null;
  }
};

// Clear user data from storage (for logout)
export const clearUserData = async (): Promise<boolean> => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.USER_DATA);
    await AsyncStorage.removeItem(STORAGE_KEYS.USER_NAME);
    await AsyncStorage.removeItem(STORAGE_KEYS.RECENT_ROOMS);
    return true;
  } catch (error) {
    console.error('Error clearing user data:', error);
    return false;
  }
};

// Legacy alias for clearUserData
export const clearUserName = clearUserData;

// Save current room to storage
export const saveCurrentRoom = async (roomData: Room): Promise<boolean> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_ROOM, JSON.stringify(roomData));
    
    // Also add to recent rooms
    const recentRooms = await getRecentRooms();
    const updatedRooms = [roomData];
    
    // Add other recent rooms (avoiding duplicates)
    if (recentRooms && recentRooms.length > 0) {
      recentRooms.forEach(room => {
        if (room.id !== roomData.id) {
          updatedRooms.push(room);
        }
      });
    }
    
    // Keep only last 5 rooms
    const limitedRooms = updatedRooms.slice(0, 5);
    await AsyncStorage.setItem(STORAGE_KEYS.RECENT_ROOMS, JSON.stringify(limitedRooms));
    
    return true;
  } catch (error) {
    console.error('Error saving current room:', error);
    return false;
  }
};

// Get current room from storage
export const getCurrentRoom = async (): Promise<Room | null> => {
  try {
    const roomData = await AsyncStorage.getItem(STORAGE_KEYS.CURRENT_ROOM);
    return roomData ? JSON.parse(roomData) : null;
  } catch (error) {
    console.error('Error getting current room:', error);
    return null;
  }
};

// Get recent rooms from storage
export const getRecentRooms = async (): Promise<Room[]> => {
  try {
    const roomsData = await AsyncStorage.getItem(STORAGE_KEYS.RECENT_ROOMS);
    return roomsData ? JSON.parse(roomsData) : [];
  } catch (error) {
    console.error('Error getting recent rooms:', error);
    return [];
  }
};

// Clear current room from storage
export const clearCurrentRoom = async (): Promise<boolean> => {
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.CURRENT_ROOM);
    return true;
  } catch (error) {
    console.error('Error clearing current room:', error);
    return false;
  }
};

// Save whether permissions have been requested
export const savePermissionsRequested = async (requested: boolean): Promise<boolean> => {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.PERMISSIONS_REQUESTED, requested.toString());
    return true;
  } catch (error) {
    console.error('Error saving permissions requested status:', error);
    return false;
  }
};

// Get whether permissions have been requested
export const getPermissionsRequested = async (): Promise<boolean> => {
  try {
    const requested = await AsyncStorage.getItem(STORAGE_KEYS.PERMISSIONS_REQUESTED);
    return requested === 'true';
  } catch (error) {
    console.error('Error getting permissions requested status:', error);
    return false;
  }
};

// Image caching functions

// Save cached image data
export const saveCachedImage = async (url: string, cachedPath?: string, width?: number, height?: number, hash?: string): Promise<boolean> => {
  try {
    // Get existing cache
    const existingCache = await getCachedImages();
    
    // Create new cache entry
    const cacheEntry: CachedImage = {
      url,
      cachedPath,
      timestamp: Date.now(),
      width,
      height,
      hash
    };
    
    // Update cache
    existingCache[url] = cacheEntry;
    
    // Save updated cache
    await AsyncStorage.setItem(STORAGE_KEYS.IMAGE_CACHE, JSON.stringify(existingCache));
    await AsyncStorage.setItem(STORAGE_KEYS.IMAGE_CACHE_TIMESTAMP, Date.now().toString());
    
    return true;
  } catch (error) {
    console.error('Error saving cached image:', error);
    return false;
  }
};

// Get all cached images
export const getCachedImages = async (): Promise<Record<string, CachedImage>> => {
  try {
    const cacheData = await AsyncStorage.getItem(STORAGE_KEYS.IMAGE_CACHE);
    return cacheData ? JSON.parse(cacheData) : {};
  } catch (error) {
    console.error('Error getting cached images:', error);
    return {};
  }
};

// Get a specific cached image
export const getCachedImage = async (url: string): Promise<CachedImage | null> => {
  try {
    const cacheData = await getCachedImages();
    const cachedImage = cacheData[url];
    
    // Check if cache is valid and not expired
    if (cachedImage && Date.now() - cachedImage.timestamp < CACHE_EXPIRATION) {
      return cachedImage;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting cached image:', error);
    return null;
  }
};

// Save room images cache
export const saveRoomImagesCache = async (roomId: string, images: RoomImage[]): Promise<boolean> => {
  try {
    // Get existing room caches
    const existingCaches = await getRoomImagesCaches();
    
    // Create cached images array
    const cachedImages: CachedImage[] = images.map(img => ({
      url: img.image_url,
      timestamp: Date.now()
    }));
    
    // Create new cache entry
    const cacheEntry: RoomImagesCache = {
      roomId,
      images: cachedImages,
      lastUpdated: Date.now()
    };
    
    // Find and update existing room cache or add new one
    const roomIndex = existingCaches.findIndex(cache => cache.roomId === roomId);
    if (roomIndex >= 0) {
      existingCaches[roomIndex] = cacheEntry;
    } else {
      existingCaches.push(cacheEntry);
    }
    
    // Keep only the 10 most recent room caches
    const limitedCaches = existingCaches
      .sort((a, b) => b.lastUpdated - a.lastUpdated)
      .slice(0, 10);
    
    // Save updated caches
    await AsyncStorage.setItem(STORAGE_KEYS.ROOM_IMAGES_CACHE, JSON.stringify(limitedCaches));
    
    return true;
  } catch (error) {
    console.error('Error saving room images cache:', error);
    return false;
  }
};

// Get all room images caches
export const getRoomImagesCaches = async (): Promise<RoomImagesCache[]> => {
  try {
    const cachesData = await AsyncStorage.getItem(STORAGE_KEYS.ROOM_IMAGES_CACHE);
    return cachesData ? JSON.parse(cachesData) : [];
  } catch (error) {
    console.error('Error getting room images caches:', error);
    return [];
  }
};

// Get images cache for a specific room
export const getRoomImagesCache = async (roomId: string): Promise<RoomImagesCache | null> => {
  try {
    const caches = await getRoomImagesCaches();
    const roomCache = caches.find(cache => cache.roomId === roomId);
    
    // Check if cache is valid and not expired
    if (roomCache && Date.now() - roomCache.lastUpdated < CACHE_EXPIRATION) {
      return roomCache;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting room images cache:', error);
    return null;
  }
};

// Clear expired image caches
export const clearExpiredImageCaches = async (): Promise<boolean> => {
  try {
    // Clear expired individual image caches
    const imageCache = await getCachedImages();
    let hasChanges = false;
    
    Object.keys(imageCache).forEach(url => {
      if (Date.now() - imageCache[url].timestamp > CACHE_EXPIRATION) {
        delete imageCache[url];
        hasChanges = true;
      }
    });
    
    if (hasChanges) {
      await AsyncStorage.setItem(STORAGE_KEYS.IMAGE_CACHE, JSON.stringify(imageCache));
    }
    
    // Clear expired room caches
    const roomCaches = await getRoomImagesCaches();
    const validRoomCaches = roomCaches.filter(
      cache => Date.now() - cache.lastUpdated < CACHE_EXPIRATION
    );
    
    if (validRoomCaches.length !== roomCaches.length) {
      await AsyncStorage.setItem(STORAGE_KEYS.ROOM_IMAGES_CACHE, JSON.stringify(validRoomCaches));
    }
    
    return true;
  } catch (error) {
    console.error('Error clearing expired image caches:', error);
    return false;
  }
}; 