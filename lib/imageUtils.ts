import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { Platform, Alert, Linking } from 'react-native';
import { RoomImage } from './supabase';
import { getPermissionsRequested, savePermissionsRequested, saveCachedImage, getCachedImage, getCachedImages, clearExpiredImageCaches as _clearExpiredImageCaches, saveRoomImagesCache } from './storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import FastImage from 'react-native-fast-image';

// For when FastImage might not be initialized properly
let FastImageInstance: any;
try {
  FastImageInstance = FastImage;
  // Check if FastImage is properly loaded
  if (!FastImageInstance || !FastImageInstance.preload) {
    console.warn('FastImage not properly initialized, using fallback');
    FastImageInstance = {
      preload: () => console.log('FastImage preload not available'),
      priority: { low: 'low', normal: 'normal', high: 'high' },
      cacheControl: { immutable: 'immutable', web: 'web', cacheOnly: 'cacheOnly' },
      resizeMode: { contain: 'contain', cover: 'cover', stretch: 'stretch', center: 'center' }
    };
  }
} catch (e) {
  console.warn('Error initializing FastImage:', e);
  FastImageInstance = {
    preload: () => console.log('FastImage preload not available'),
    priority: { low: 'low', normal: 'normal', high: 'high' },
    cacheControl: { immutable: 'immutable', web: 'web', cacheOnly: 'cacheOnly' },
    resizeMode: { contain: 'contain', cover: 'cover', stretch: 'stretch', center: 'center' }
  };
}

// Re-export clearExpiredImageCaches from storage
export { clearExpiredImageCaches } from './storage';

// Get file name from URL
const getFilenameFromUrl = (url: string): string => {
  const urlParts = url.split('/');
  const fileName = urlParts[urlParts.length - 1].split('?')[0]; // Remove query params if any
  return fileName || `image_${Date.now()}.jpg`;
};

// Optimize Cloudinary URL for downloading (remove transformations, get original size)
const optimizeCloudinaryUrl = (url: string): string => {
  try {
    // If it's a Cloudinary URL, optimize it
    if (url.includes('cloudinary.com')) {
      // Cloudinary URLs have a pattern: https://res.cloudinary.com/cloud_name/image/upload/[transformations]/[public_id].[ext]
      // To get the original image, we want to remove transformations
      const urlParts = url.split('/upload/');
      if (urlParts.length === 2) {
        // Find the version part (v1234) and the rest
        const secondPart = urlParts[1];
        const versionMatch = secondPart.match(/^v\d+\//);
        
        if (versionMatch) {
          // Keep the version but remove transformations
          const version = versionMatch[0];
          const publicIdWithExt = secondPart.substring(version.length);
          return `${urlParts[0]}/upload/${version}${publicIdWithExt}`;
        }
        
        // If no version found, just use the basic URL
        return `${urlParts[0]}/upload/${secondPart}`;
      }
    }
    
    // Not a Cloudinary URL or couldn't parse, return as is
    return url;
  } catch (error) {
    console.error('Error optimizing Cloudinary URL:', error);
    return url; // Return original URL on error
  }
};

// Function to open app settings on Android
const openAndroidSettings = async (): Promise<void> => {
  if (Platform.OS === 'android') {
    try {
      await Linking.openSettings();
    } catch (error) {
      console.error('Could not open settings:', error);
    }
  }
};

// Check media library permissions with minimal prompts
const checkMediaLibraryPermissions = async (): Promise<boolean> => {
  try {
    // First check if we already requested permissions during app initialization
    const permissionsRequested = await getPermissionsRequested();
    const { status } = await MediaLibrary.getPermissionsAsync();
    
    // On Android, we want to be more careful
    if (Platform.OS === 'android') {
      console.log(`Media Library permission status: ${status}`);
      
      if (status === 'granted') {
        // Permission is already granted, proceed
        return true;
      } else if (permissionsRequested) {
        // We already requested permissions before, but they're not granted
        // This likely means the user denied them
        console.log('Permissions were previously requested but are not granted');
        
        // Since we already asked at app startup and user declined, don't ask again
        // Instead, direct them to settings
        Alert.alert(
          'Permission Required', 
          'To save images, please enable media access in your device settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Open Settings', 
              onPress: () => {
                openAndroidSettings();
              }
            }
          ]
        );
        return false;
      } else {
        // First time requesting, let's ask
        console.log('First time requesting Media Library permissions');
        const { status: newStatus } = await MediaLibrary.requestPermissionsAsync(true);
        
        // Update the permission requested flag
        await savePermissionsRequested(true);
        
        // Log and return result
        console.log(`Media Library permission after request: ${newStatus}`);
        return newStatus === 'granted';
      }
    } else {
      // On iOS, the process is more straightforward
      if (status === 'granted') {
        return true;
      }
      
      // If we already requested and got denied, just show a simple message
      if (permissionsRequested) {
        Alert.alert(
          'Permission Required', 
          'To save images, please enable media access in your device settings.'
        );
        return false;
      }
      
      // Otherwise, request the permission
      const { status: newStatus } = await MediaLibrary.requestPermissionsAsync();
      await savePermissionsRequested(true);
      return newStatus === 'granted';
    }
  } catch (error) {
    console.error('Error checking media library permissions:', error);
    return false;
  }
};

// Directory for cached images
const IMAGE_CACHE_DIR = `${FileSystem.cacheDirectory}images/`;

// Ensure cache directory exists
export const ensureCacheDirExists = async (): Promise<void> => {
  try {
    const dirInfo = await FileSystem.getInfoAsync(IMAGE_CACHE_DIR);
    if (!dirInfo.exists) {
      console.log('Creating image cache directory...');
      await FileSystem.makeDirectoryAsync(IMAGE_CACHE_DIR, { intermediates: true });
    }
  } catch (error) {
    console.error('Error ensuring cache directory exists:', error);
  }
};

// Initialize cache system
export const initImageCache = async (): Promise<void> => {
  await ensureCacheDirExists();
  await _clearExpiredImageCaches();
};

// Cache an image from URL
export const cacheImage = async (url: string): Promise<string | null> => {
  try {
    // Check if already cached
    const existingCache = await getCachedImage(url);
    if (existingCache && existingCache.cachedPath) {
      const pathInfo = await FileSystem.getInfoAsync(existingCache.cachedPath);
      if (pathInfo.exists) {
        console.log('Using existing cached image:', existingCache.cachedPath);
        return existingCache.cachedPath;
      }
    }

    // Create a unique filename based on URL
    const filename = url.split('/').pop() || `image-${Date.now()}.jpg`;
    const cachedPath = `${IMAGE_CACHE_DIR}${filename}`;
    
    // Download the image
    console.log(`Caching image from ${url} to ${cachedPath}`);
    const downloadResult = await FileSystem.downloadAsync(url, cachedPath);
    
    if (downloadResult.status === 200) {
      // Save cache info
      await saveCachedImage(url, cachedPath);
      return cachedPath;
    }
    
    return null;
  } catch (error) {
    console.error('Error caching image:', error);
    return null;
  }
};

// Preload images for a room
export const preloadRoomImages = async (roomId: string, images: any[]) => {
  console.log(`Preloading images for room ${roomId}`);
  
  if (!images || images.length === 0) {
    console.log('No images to preload');
    return;
  }
  
  try {
    // Extract URLs
    const urls = images.map(img => img.image_url).filter(Boolean);
    
    // First preload a subset of most recent images with high priority
    const recentImages = urls.slice(0, Math.min(10, urls.length));
    if (recentImages.length > 0) {
      await cacheImagesWithPriority(recentImages, 'high');
    }
    
    // Then preload the rest with normal priority
    const remainingImages = urls.slice(Math.min(10, urls.length));
    if (remainingImages.length > 0) {
      // Do this in the background
      cacheImagesWithPriority(remainingImages, 'normal')
        .catch(err => console.warn('Error caching remaining images:', err));
    }
    
    console.log(`Completed preloading initial images for room ${roomId}`);
  } catch (error) {
    console.error('Error preloading room images:', error);
  }
};

// Get cached image URI (returns original URL if not cached)
export const getCachedImageUri = async (url: string): Promise<string> => {
  try {
    const cachedImage = await getCachedImage(url);
    if (cachedImage && cachedImage.cachedPath) {
      const pathInfo = await FileSystem.getInfoAsync(cachedImage.cachedPath);
      if (pathInfo.exists) {
        return cachedImage.cachedPath;
      }
    }
    
    // If not cached or cache is invalid, return original URL
    return url;
  } catch (error) {
    console.error('Error getting cached image URI:', error);
    return url;
  }
};

// Download an image to the device's media library
export const downloadImage = async (imageUrl: string): Promise<{ success: boolean; permissionDenied?: boolean }> => {
  try {
    // Request permission to save to media library
    const { status } = await MediaLibrary.requestPermissionsAsync();
    
    if (status !== 'granted') {
      console.log('Media library permission not granted');
      return { success: false, permissionDenied: true };
    }
    
    // First check if we have a cached version
    let fileUri = await getCachedImageUri(imageUrl);
    
    // If we're using the original URL, download it to a temporary file first
    if (fileUri === imageUrl) {
      const filename = imageUrl.split('/').pop() || `download-${Date.now()}.jpg`;
      const tempFilePath = `${FileSystem.cacheDirectory}${filename}`;
    
      const downloadResult = await FileSystem.downloadAsync(imageUrl, tempFilePath);
    
      if (downloadResult.status !== 200) {
        console.log('Error downloading image:', downloadResult);
      return { success: false };
      }
      
      fileUri = tempFilePath;
    }
    
    // Save to media library
    const asset = await MediaLibrary.createAssetAsync(fileUri);
    
    // Create album if on Android
    if (Platform.OS === 'android') {
      const album = await MediaLibrary.getAlbumAsync('QuickLoop');
      if (album === null) {
        await MediaLibrary.createAlbumAsync('QuickLoop', asset, false);
    } else {
        await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
    }
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error downloading image:', error);
    return { success: false };
  }
};

// Download multiple images to the device's media library
export const downloadMultipleImages = async (
  images: { image_url: string }[]
): Promise<{ success: boolean; count: number; permissionDenied?: boolean }> => {
  try {
    // Request permission to save to media library
    const { status } = await MediaLibrary.requestPermissionsAsync();
    
    if (status !== 'granted') {
      console.log('Media library permission not granted');
      return { success: false, count: 0, permissionDenied: true };
    }
    
    let successCount = 0;
    
    // Process each image
    for (const image of images) {
      try {
        // First check if we have a cached version
        let fileUri = await getCachedImageUri(image.image_url);
          
        // If we're using the original URL, download it to a temporary file first
        if (fileUri === image.image_url) {
          const filename = image.image_url.split('/').pop() || `download-${Date.now()}-${successCount}.jpg`;
          const tempFilePath = `${FileSystem.cacheDirectory}${filename}`;
          
          const downloadResult = await FileSystem.downloadAsync(image.image_url, tempFilePath);
          
          if (downloadResult.status !== 200) {
            console.log('Error downloading image:', downloadResult);
            continue;
          }
          
          fileUri = tempFilePath;
        }
        
          // Save to media library
          const asset = await MediaLibrary.createAssetAsync(fileUri);
          
        // Create album if on Android
        if (Platform.OS === 'android') {
          const album = await MediaLibrary.getAlbumAsync('QuickLoop');
          if (album === null) {
            await MediaLibrary.createAlbumAsync('QuickLoop', asset, false);
          } else {
            await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
          }
          }
          
          successCount++;
      } catch (error) {
        console.error('Error processing image:', error);
        // Continue with next image
      }
    }
    
    return { 
      success: successCount > 0, 
      count: successCount 
    };
  } catch (error) {
    console.error('Error downloading multiple images:', error);
    return { success: false, count: 0 };
  }
};

// Clear the image cache
export const clearImageCache = async (): Promise<boolean> => {
          try {
    await FileSystem.deleteAsync(IMAGE_CACHE_DIR, { idempotent: true });
    await ensureCacheDirExists();
    return true;
  } catch (error) {
    console.error('Error clearing image cache:', error);
    return false;
  }
};

// Remove a specific image from cache by URL
export const removeCachedImage = async (imageUrl: string): Promise<boolean> => {
  try {
    // Get the cached image info
    const cachedImage = await getCachedImage(imageUrl);
    
    if (!cachedImage || !cachedImage.cachedPath) {
      console.log(`No cached file found for URL: ${imageUrl}`);
      return false;
    }
    
    // Check if the file exists
    const fileInfo = await FileSystem.getInfoAsync(cachedImage.cachedPath);
    
    if (fileInfo.exists) {
      // Delete the file
      console.log(`Deleting cached file: ${cachedImage.cachedPath}`);
      await FileSystem.deleteAsync(cachedImage.cachedPath, { idempotent: true });
    }
    
    // Remove from the metadata cache by getting all cached images,
    // removing the entry, and saving the updated cache back
    const existingCache = await getCachedImages();
    if (existingCache[imageUrl]) {
      delete existingCache[imageUrl];
      
      // Use saveCachedImage for all other URLs to rebuild the cache
      const savePromises = Object.values(existingCache).map(img => 
        saveCachedImage(img.url, img.cachedPath, img.width, img.height, img.hash)
      );
      
      await Promise.all(savePromises);
      console.log(`Removed ${imageUrl} from cache metadata`);
    }
    
    return true;
  } catch (error) {
    console.error('Error removing cached image:', error);
    return false;
  }
};

// Add priority caching for recent images
export const cacheImagesWithPriority = async (imageUrls: string[], priority: 'high' | 'normal' | 'low' = 'normal'): Promise<void> => {
  if (!imageUrls || imageUrls.length === 0) return;
  
  console.log(`Starting priority caching of ${imageUrls.length} images with priority ${priority}`);
  
  const BATCH_SIZE = priority === 'high' ? 3 : 5;
  let completedCount = 0;
  let failedCount = 0;
  
  // Process in smaller batches to not overwhelm the device
  for (let i = 0; i < imageUrls.length; i += BATCH_SIZE) {
    const batch = imageUrls.slice(i, i + BATCH_SIZE);
    
    // For high priority, use Promise.all to process in parallel
    // For normal/low priority, process sequentially
    if (priority === 'high') {
      const results = await Promise.allSettled(
        batch.map(url => cacheImage(url))
      );
      
      completedCount += results.filter(r => r.status === 'fulfilled').length;
      failedCount += results.filter(r => r.status === 'rejected').length;
    } else {
      for (const url of batch) {
        try {
          await cacheImage(url);
          completedCount++;
        } catch (error) {
          console.warn(`Failed to cache image: ${url}`, error);
          failedCount++;
        }
      }
    }
    
    // Add a small delay between batches for lower priorities
    if (priority !== 'high' && i + BATCH_SIZE < imageUrls.length) {
      await new Promise(resolve => setTimeout(resolve, priority === 'normal' ? 100 : 300));
    }
  }
  
  console.log(`Completed caching ${completedCount}/${imageUrls.length} images with priority ${priority}. Failed: ${failedCount}`);
}; 