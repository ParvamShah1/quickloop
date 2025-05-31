import { createClient } from '@supabase/supabase-js';
import { Platform, NativeModules } from 'react-native';
import { uploadToCloudinary, deleteFromCloudinary, deleteMultipleFromCloudinary } from './cloudinary';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { removeCachedImage } from './imageUtils';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@env';

// Use imported environment variables
const supabaseUrl = SUPABASE_URL;
const supabaseAnonKey = SUPABASE_ANON_KEY;

// Create client with AsyncStorage for persistence
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false
  },
  global: {
    fetch: (...args) => fetch(...args)
  },
  // Enable realtime with limited events per second
  realtime: {
    params: {
      eventsPerSecond: 2
    }
  }
});

// Function to test connection
export const testSupabaseConnection = async () => {
  try {
    console.log("Supabase URL:", supabaseUrl);
    
    // Try to check if we can at least connect to Supabase
    try {
      const { error: authError } = await supabase.auth.getSession();
      if (authError) {
        console.log("Auth check failed:", authError);
        return { 
          success: false, 
          message: `Connection failed: ${authError.message}` 
        };
      }
      console.log("Auth check passed");
    } catch (authErr) {
      console.log("Auth check exception:", authErr);
    }
    
    // Now try to access the test table
    console.log("Attempting to query test table...");
    const { data, error } = await supabase.from('test').select('*').limit(1);
    
    if (error) {
      console.log("Test table query failed:", error);
      
      // Check if this is a "relation does not exist" error
      if (error.message && error.message.includes('relation "public.test" does not exist')) {
        return { 
          success: false, 
          message: 'Connection to Supabase is working, but the "test" table does not exist. Please create the table using the SQL in CreateTestTable.sql.' 
        };
      }
      
      return { 
        success: false, 
        message: `Query failed: ${error.message}` 
      };
    }
    
    console.log("Test table query succeeded:", data);
    return { 
      success: true, 
      message: `Connection successful! ${data && data.length > 0 ? 'Data found in test table.' : 'No data in test table.'}` 
    };
  } catch (error) {
    console.error("Unexpected error in testSupabaseConnection:", error);
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'Unknown error occurred' 
    };
  }
};

// Generate a unique device ID
export const getDeviceId = async (): Promise<string> => {
  // Try to get device ID or generate a unique one
  try {
    const deviceId = NativeModules.Device.deviceName || 
                     NativeModules.Device.modelName || 
                     `${Platform.OS}-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    return deviceId;
  } catch (error) {
    // Fallback to a random ID
    return `${Platform.OS}-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
  }
};

// Get device info
export const getDeviceInfo = async (): Promise<Record<string, any>> => {
  try {
    return {
      platform: Platform.OS,
      version: Platform.Version,
      model: NativeModules.Device.modelName || 'Unknown',
      brand: NativeModules.Device.brand || 'Unknown',
      isDevice: NativeModules.Device.isDevice,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      platform: Platform.OS,
      version: Platform.Version,
      error: 'Could not get device info'
    };
  }
};

// Types for our database tables
export interface User {
  id?: string;
  username: string;
  phone_number?: string;
  created_at?: string;
}

export interface Room {
  id: string;
  name: string;
  created_by: string;
  active?: boolean;
  created_at?: string;
  expiry_time?: string; // ISO string for when the room expires
}

export interface RoomImage {
  id?: string;
  room_id: string;
  image_url: string;
  uploaded_by: string;
  uploaded_at?: string;
}

export interface UserRoom {
  id?: string;
  user_id: string;
  room_id: string;
  joined_at?: string;
  is_favorite?: boolean;
  room?: Room; // Joined room data
}

// Helper functions for database operations
export const createUser = async (name: string, phoneNumber?: string): Promise<User | null> => {
  try {
    const { data, error } = await supabase
      .from('users')
      .insert({
        username: name,
        phone_number: phoneNumber
      })
      .select();
    
    if (error) {
      console.error('Error creating user:', error);
      return null;
    }
    
    return data?.[0] || null;
  } catch (error) {
    console.error('Exception creating user:', error);
    return null;
  }
};

// Replace getDeviceId and getDeviceInfo with a simpler function to check if user exists
export const checkUserExists = async (username: string): Promise<User | null> => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .maybeSingle();
    
    if (error) {
      console.error('Error checking user:', error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Exception checking user:', error);
    return null;
  }
};

// Add function to check if a phone number exists
export const checkPhoneNumberExists = async (phoneNumber: string): Promise<User | null> => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('phone_number', phoneNumber)
      .maybeSingle();
    
    if (error) {
      console.error('Error checking phone number:', error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Exception checking phone number:', error);
    return null;
  }
};

// Add function to update user's phone number
export const updateUserPhoneNumber = async (userId: string, phoneNumber: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('users')
      .update({ phone_number: phoneNumber })
      .eq('id', userId);
    
    if (error) {
      console.error('Error updating user phone number:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Exception updating user phone number:', error);
    return false;
  }
};

// Generate a unique room code (6 characters)
export const generateRoomCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing characters like 0, O, 1, I
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Create a new room
export const createRoom = async (name: string, createdBy: string, duration: number = 60, unit: string = 'minutes'): Promise<Room | null> => {
  try {
    // Generate a unique room code
    let roomCode = generateRoomCode();
    let isUnique = false;
    
    // Make sure room code is unique
    while (!isUnique) {
      const { data } = await supabase
        .from('rooms')
        .select('id')
        .eq('id', roomCode)
        .single();
      
      if (!data) {
        isUnique = true;
      } else {
        roomCode = generateRoomCode();
      }
    }
    
    // Calculate expiry time based on duration and unit
    const expiryTime = new Date();
    if (unit === 'hours') {
      expiryTime.setHours(expiryTime.getHours() + duration);
    } else {
      // Default to minutes
      expiryTime.setMinutes(expiryTime.getMinutes() + duration);
    }
    
    const { data, error } = await supabase
      .from('rooms')
      .insert({
        id: roomCode,
        name,
        created_by: createdBy,
        active: true,
        expiry_time: expiryTime.toISOString()
      })
      .select();
    
    if (error) {
      console.error('Error creating room:', error);
      return null;
    }
    
    return data?.[0] || null;
  } catch (error) {
    console.error('Exception creating room:', error);
    return null;
  }
};

// Join a room
export const joinRoom = async (roomCode: string): Promise<Room | null> => {
  try {
    const now = new Date().toISOString();
    
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomCode)
      .eq('active', true)
      .gte('expiry_time', now) // Make sure room hasn't expired
      .single();
    
    if (error || !data) {
      console.error('Error joining room:', error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Exception joining room:', error);
    return null;
  }
};

// Upload an image to a room using Cloudinary
export const uploadRoomImage = async (
  roomId: string, 
  imageUri: string, 
  uploadedBy: string,
  quality?: number
): Promise<RoomImage | null> => {
  try {
    console.log('Uploading image to Cloudinary...');
    
    // Upload to Cloudinary instead of Supabase Storage
    const imageUrl = await uploadToCloudinary(imageUri, quality);
    
    console.log('Image uploaded to Cloudinary:', imageUrl);
    
    // Save the image record in the database
    const { data, error } = await supabase
      .from('room_images')
      .insert({
        room_id: roomId,
        image_url: imageUrl,
        uploaded_by: uploadedBy
      })
      .select();
    
    if (error) {
      console.error('Error saving image record:', error);
      return null;
    }
    
    return data?.[0] || null;
  } catch (error) {
    console.error('Exception uploading room image:', error);
    return null;
  }
};

// Get all images for a room
export const getRoomImages = async (roomId: string): Promise<RoomImage[]> => {
  try {
    const { data, error } = await supabase
      .from('room_images')
      .select('*')
      .eq('room_id', roomId)
      .order('uploaded_at', { ascending: false });
    
    if (error) {
      console.error('Error getting room images:', error);
      return [];
    }
    
    return data || [];
  } catch (error) {
    console.error('Exception getting room images:', error);
    return [];
  }
};

// Simple direct deletion of an image by ID - clean implementation
export const deleteRoomImage = async (imageId: string): Promise<boolean> => {
  try {
    console.log(`Attempting to delete image with ID: ${imageId}`);
    
    // First get the image to retrieve its URL
    const { data: imageData, error: fetchError } = await supabase
      .from('room_images')
      .select('image_url')
      .eq('id', imageId)
      .single();
    
    if (fetchError) {
      console.error('Error fetching image data:', fetchError);
    } else if (imageData && imageData.image_url) {
      // Delete from Cloudinary first
      await deleteFromCloudinary(imageData.image_url);
      
      // Remove from local cache
      await removeCachedImage(imageData.image_url);
    }
    
    // First try using the RPC function - more reliable
    const { data: rpcResult, error: rpcError } = await supabase
      .rpc('delete_room_image', { image_id: imageId });
    
    if (!rpcError && rpcResult === true) {
      console.log('Successfully deleted image using RPC function');
      return true;
    }
    
    if (rpcError) {
      console.error('RPC delete failed, trying direct delete:', rpcError);
    } else {
      console.log('RPC returned false, trying direct delete');
    }
    
    // Fallback to direct deletion
    const { error } = await supabase
      .from('room_images')
      .delete()
      .eq('id', imageId);
    
    if (error) {
      console.error('Error deleting image from database:', error);
      return false;
    }
    
    console.log('Successfully deleted image using direct delete');
    return true;
  } catch (error) {
    console.error('Error deleting image:', error);
    return false;
  }
};

// Bulk delete images - with efficient Cloudinary deletion
export const deleteMultipleRoomImages = async (imageIds: string[]): Promise<boolean> => {
  try {
    if (imageIds.length === 0) {
      return true;
    }
    
    console.log(`Attempting to delete ${imageIds.length} images`);
    
    // First fetch all the image URLs for Cloudinary deletion
    const { data: imageData, error: fetchError } = await supabase
      .from('room_images')
      .select('id, image_url')
      .in('id', imageIds);
    
    if (fetchError) {
      console.error('Error fetching image data for bulk deletion:', fetchError);
    } else if (imageData && imageData.length > 0) {
      // Extract image URLs and delete from Cloudinary in bulk
      const imageUrls = imageData.map(img => img.image_url).filter(url => !!url);
      
      if (imageUrls.length > 0) {
        console.log(`Deleting ${imageUrls.length} images from Cloudinary`);
        await deleteMultipleFromCloudinary(imageUrls);
        
        // Remove from local cache in batch
        console.log(`Removing ${imageUrls.length} images from local cache`);
        await Promise.all(imageUrls.map(url => removeCachedImage(url)));
      }
    }
    
    // Then delete from database
    const { error } = await supabase
      .from('room_images')
      .delete()
      .in('id', imageIds);
    
    if (error) {
      console.error('Error deleting images from database:', error);
      return false;
    }
    
    console.log(`Successfully deleted ${imageIds.length} images from database`);
    return true;
  } catch (error) {
    console.error('Error bulk deleting images:', error);
    return false;
  }
};

// Get user by username
export const getUserByUsername = async (username: string): Promise<User | null> => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();
    
    if (error) {
      console.error('Error getting user:', error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('Exception getting user:', error);
    return null;
  }
};

// Join a room and save it to user's rooms
export const joinAndSaveRoom = async (userId: string, roomId: string): Promise<boolean> => {
  try {
    // First check if the room exists
    const { data: roomData, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .eq('active', true)
      .single();
    
    if (roomError || !roomData) {
      console.error('Error joining room, room not found:', roomError);
      return false;
    }
    
    // Then add the user-room relationship
    const { error } = await supabase
      .from('user_rooms')
      .upsert({
        user_id: userId,
        room_id: roomId
      }, { 
        onConflict: 'user_id,room_id' 
      });
    
    if (error) {
      console.error('Error saving room to user rooms:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Exception saving room to user rooms:', error);
    return false;
  }
};

// Get all rooms a user has joined
export const getUserRooms = async (userId: string): Promise<UserRoom[]> => {
  try {
    const { data, error } = await supabase
      .from('user_rooms')
      .select(`
        *,
        room:rooms(*)
      `)
      .eq('user_id', userId)
      .order('joined_at', { ascending: false });
    
    if (error) {
      console.error('Error getting user rooms:', error);
      return [];
    }
    
    return data || [];
  } catch (error) {
    console.error('Exception getting user rooms:', error);
    return [];
  }
};

// Leave a room (remove from user's rooms)
export const leaveRoom = async (userId: string, roomId: string): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('user_rooms')
      .delete()
      .eq('user_id', userId)
      .eq('room_id', roomId);
    
    if (error) {
      console.error('Error leaving room:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Exception leaving room:', error);
    return false;
  }
};

// Toggle favorite status of a room
export const toggleFavoriteRoom = async (userRoomId: string, isFavorite: boolean): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('user_rooms')
      .update({ is_favorite: isFavorite })
      .eq('id', userRoomId);
    
    if (error) {
      console.error('Error toggling favorite status:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Exception toggling favorite status:', error);
    return false;
  }
};

// Check and delete expired rooms
export const cleanupExpiredRooms = async (): Promise<boolean> => {
  try {
    const now = new Date().toISOString();
    
    // First get all expired rooms
    const { data: expiredRooms, error: fetchError } = await supabase
      .from('rooms')
      .select('id')
      .lt('expiry_time', now)
      .eq('active', true);
    
    if (fetchError) {
      console.error('Error fetching expired rooms:', fetchError);
      return false;
    }
    
    if (!expiredRooms || expiredRooms.length === 0) {
      console.log('No expired rooms to clean up');
      return true;
    }
    
    console.log(`Found ${expiredRooms.length} expired rooms to delete`);
    
    // Get the IDs of expired rooms
    const expiredRoomIds = expiredRooms.map(room => room.id);
    
    // Delete images from expired rooms
    for (const roomId of expiredRoomIds) {
      // Get all images for this room
      const { data: roomImages } = await supabase
        .from('room_images')
        .select('id, image_url')
        .eq('room_id', roomId);
      
      if (roomImages && roomImages.length > 0) {
        console.log(`Processing ${roomImages.length} images from expired room ${roomId}`);
        
        // Extract all image URLs
        const imageUrls = roomImages.map(img => img.image_url).filter(url => !!url);
        
        // Delete from Cloudinary using bulk deletion
        if (imageUrls.length > 0) {
          await deleteMultipleFromCloudinary(imageUrls);
        }
        
        // Then delete from database
        const imageIds = roomImages.map(img => img.id as string);
        await deleteMultipleRoomImages(imageIds);
        console.log(`Deleted ${imageIds.length} images from expired room ${roomId}`);
      }
    }
    
    // Delete user_rooms associations
    const { error: userRoomsError } = await supabase
      .from('user_rooms')
      .delete()
      .in('room_id', expiredRoomIds);
    
    if (userRoomsError) {
      console.error('Error deleting user_rooms:', userRoomsError);
    } else {
      console.log(`Deleted user_rooms associations for ${expiredRoomIds.length} rooms`);
    }
    
    // Mark rooms as inactive (soft delete)
    const { error: roomsError } = await supabase
      .from('rooms')
      .update({ active: false })
      .in('id', expiredRoomIds);
    
    if (roomsError) {
      console.error('Error deactivating rooms:', roomsError);
      return false;
    }
    
    console.log(`Successfully deactivated ${expiredRoomIds.length} expired rooms`);
    return true;
  } catch (error) {
    console.error('Exception cleaning up expired rooms:', error);
    return false;
  }
}; 