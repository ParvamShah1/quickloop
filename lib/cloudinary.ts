// Cloudinary configuration and utilities
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET, CLOUDINARY_API_KEY, SUPABASE_ANON_KEY } from '@env';

// Use imported environment variables
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
const CLOUDINARY_DESTROY_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/destroy`;

// Extract the public ID from a Cloudinary URL
export const getCloudinaryPublicId = (url: string): string | null => {
  try {
    if (!url) {
      console.error('Empty URL provided to getCloudinaryPublicId');
      return null;
    }
    
    console.log('Extracting public ID from URL:', url);
    
    // Different approaches to extract the public ID
    
    // 1. Standard Cloudinary URL format with /upload/ path
    if (url.includes('cloudinary.com') && url.includes('/upload/')) {
      // Simple regex to match the main pattern: anything after "/upload/" up to the extension
      const regex = /\/upload\/(?:v\d+\/)?(.+?)(?:\.\w+)?$/;
      const match = url.match(regex);
      
      if (match && match[1]) {
        const publicId = match[1];
        console.log('Extracted public ID (regex method):', publicId);
        return publicId;
      }
      
      // Fallback to URL parsing method
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/');
      
      // Find the upload part index
      const uploadIndex = pathParts.findIndex(part => part === 'upload');
      if (uploadIndex >= 0 && uploadIndex < pathParts.length - 1) {
        // Get all parts after 'upload', skipping the version if present
        let startIndex = uploadIndex + 1;
        if (pathParts[startIndex] && pathParts[startIndex].startsWith('v')) {
          startIndex++;
        }
        
        // Join the remaining parts and remove the file extension
        const publicIdWithExt = pathParts.slice(startIndex).join('/');
        const publicId = publicIdWithExt.replace(/\.\w+$/, '');
        
        console.log('Extracted public ID (URL parsing method):', publicId);
        return publicId;
      }
    }
    
    console.error('Could not extract public ID from URL:', url);
    return null;
  } catch (error) {
    console.error('Error extracting Cloudinary public ID:', error);
    return null;
  }
};

// Compress image before uploading if needed
const compressImageIfNeeded = async (uri: string): Promise<string> => {
  try {
    // Get file info to check size
    const fileInfo = await FileSystem.getInfoAsync(uri, { size: true });
    
    // If file is already small enough, return original
    if (fileInfo.exists && fileInfo.size && fileInfo.size < 1000000) { // Less than 1MB
      return uri;
    }
    
    // For larger files, we'll use manipulateAsync to resize if available
    // But this is simplified since in a real app you'd use Image Manipulator
    // which requires additional dependencies
    
    // Return original for now, but in a real app you could:
    // 1. Use expo-image-manipulator to resize
    // 2. Apply compression before upload
    return uri;
  } catch (error) {
    console.warn('Error compressing image:', error);
    return uri; // Return original on error
  }
};

// Upload an image to Cloudinary with optimized settings and retry logic
export const uploadToCloudinary = async (uri: string, quality?: number): Promise<string> => {
  const MAX_RETRIES = 3;
  const TIMEOUT_MS = 30000; // 30 seconds
  const CHUNK_SIZE = 500000; // 500KB chunks for large files
  
  let attempt = 0;
  
  while (attempt < MAX_RETRIES) {
    attempt++;
    try {
      console.log(`Uploading to Cloudinary (attempt ${attempt}/${MAX_RETRIES})`);
      
      // Potentially compress if needed (implementation would be enhanced in production)
      const processedUri = await compressImageIfNeeded(uri);
      
      // Get file information to check size
      const fileInfo = await FileSystem.getInfoAsync(processedUri, { size: true });
      const fileSize = fileInfo.size || 0;
      
      // For larger files, consider chunked upload, but for now we'll use a single upload with timeout
      console.log(`File size: ${fileSize} bytes`);
      
      // Prepare the form data
      const formData = new FormData();
      
      // Get the file name and type
      const uriParts = processedUri.split('.');
      const fileType = uriParts[uriParts.length - 1] || 'jpg';
      
      // Add the file to the form
      formData.append('file', {
        uri: processedUri,
        name: `photo_${Date.now()}.${fileType}`,
        type: `image/${fileType}`,
      } as any);
      
      // Add the upload preset
      formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
      
      // Set quality parameter if provided, otherwise use auto
      if (quality && quality > 0 && quality <= 1) {
        // Convert quality from 0-1 scale to percentage for Cloudinary
        const qualityValue = Math.round(quality * 100).toString();
        formData.append('quality', qualityValue);
      } else {
        formData.append('quality', 'auto'); // Let Cloudinary optimize quality
      }
      
      formData.append('fetch_format', 'auto'); // Use optimal format (WebP where supported)
      
      // For large files, we can use tags to identify them for later optimizations
      // This is allowed in unsigned uploads
      if (fileSize > 1000000) { // For files > 1MB
        formData.append('tags', 'large_file,compression_candidate');
      }
      
      // Send the request with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
        console.log('Upload timed out, aborting');
      }, TIMEOUT_MS);
      
      console.log('Sending upload request to Cloudinary...');
      const response = await fetch(CLOUDINARY_UPLOAD_URL, {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'multipart/form-data',
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      // Parse the response
      const data = await response.json();
      
      if (response.ok) {
        console.log('Cloudinary upload successful');
        // Return the secure URL of the uploaded image
        return data.secure_url;
      } else {
        throw new Error(data.error?.message || 'Failed to upload image');
      }
    } catch (error: any) {
      const isTimeout = error.name === 'AbortError';
      const isNetworkError = error.message && (
        error.message.includes('Network') || 
        error.message.includes('network') ||
        error.message.includes('connection')
      );
      
      console.error(`Error uploading to Cloudinary (attempt ${attempt}/${MAX_RETRIES}):`, error);
      
      // Only retry on timeout or network errors
      if (attempt < MAX_RETRIES && (isTimeout || isNetworkError)) {
        const delay = 1000 * attempt; // Exponential backoff
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // If we've reached max retries or it's not a retryable error, throw
      throw error;
    }
  }
  
  throw new Error(`Failed to upload image after ${MAX_RETRIES} attempts`);
};

// Delete an image from Cloudinary using Edge Function proxy
export const deleteFromCloudinary = async (imageUrl: string): Promise<boolean> => {
  try {
    const publicId = getCloudinaryPublicId(imageUrl);
    
    if (!publicId) {
      console.error('Could not extract public ID from URL:', imageUrl);
      return false;
    }
    
    console.log(`Attempting to delete Cloudinary image with public ID: ${publicId}`);
    
    // Use the Edge Function that calls Cloudinary's destroy method
    const edgeFunctionUrl = 'https://ubbkfmsqkcpewlzknifd.supabase.co/functions/v1/delete-cloudinary-image';
    
    console.log('Sending request to:', edgeFunctionUrl, 'with publicId:', publicId);
    
    // Simplified: Create a clean request body
    const requestBody = {
      publicId: publicId
    };
    
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify(requestBody)
    });
    
    console.log('Response status:', response.status, response.statusText);
    
    // Log raw response content for debugging
    const responseText = await response.text();
    console.log('Raw response text:', responseText);
    
    // Parse the JSON if possible
    let result;
    try {
      result = JSON.parse(responseText);
      console.log('Parsed result:', JSON.stringify(result, null, 2));
    } catch (parseError) {
      console.error('Error parsing response JSON:', parseError);
      return false;
    }
    
    if (response.ok && result.success) {
      console.log(`Successfully deleted image from Cloudinary: ${publicId}`);
      return true;
    } else {
      console.error('Failed to delete image from Cloudinary:', result.error || 'Unknown error', result.details || '');
      return false;
    }
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
    return false;
  }
};

// Delete multiple images from Cloudinary using Edge Function proxy
export const deleteMultipleFromCloudinary = async (imageUrls: string[]): Promise<{
  success: boolean, 
  deletedCount: number
}> => {
  try {
    if (!imageUrls || imageUrls.length === 0) {
      return { success: true, deletedCount: 0 };
    }
    
    // Extract public IDs from all URLs
    const publicIds: string[] = [];
    
    for (const url of imageUrls) {
      const publicId = getCloudinaryPublicId(url);
      console.log('Extracted public ID:', publicId);
      if (publicId) {
        publicIds.push(publicId);
      } else {
        console.warn(`Could not extract public ID from URL: ${url}`);
      }
    }
    
    if (publicIds.length === 0) {
      console.error('No valid public IDs found for deletion');
      return { success: false, deletedCount: 0 };
    }
    
    console.log(`Attempting to delete ${publicIds.length} Cloudinary images`);
    
    // Use the Edge Function that calls Cloudinary's delete_resources method
    const edgeFunctionUrl = 'https://ubbkfmsqkcpewlzknifd.supabase.co/functions/v1/delete-cloudinary-resources';
    
    console.log('Sending request to:', edgeFunctionUrl, 'with publicIds:', publicIds);
    
    // Simplified: just send the array of public IDs in a clean format
    const requestBody = {
      publicIds: publicIds
    };
    
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify(requestBody)
    });
    
    console.log('Response status:', response.status, response.statusText);
    
    // Log raw response content for debugging
    const responseText = await response.text();
    console.log('Raw response text:', responseText);
    
    // Parse the JSON if possible
    let result;
    try {
      result = JSON.parse(responseText);
      console.log('Parsed result:', JSON.stringify(result, null, 2));
    } catch (parseError) {
      console.error('Error parsing response JSON:', parseError);
      return { success: false, deletedCount: 0 };
    }
   
    
    if (response.ok && result.success) {
      // Count how many were actually deleted
      const deletedCount = Object.keys(result.deleted || {}).length;
      console.log(`Successfully deleted ${deletedCount} images from Cloudinary`);
      return { success: true, deletedCount };
    } else {
      console.error('Failed to delete images from Cloudinary:', result.error || 'Unknown error', result.details || '');
      return { success: false, deletedCount: 0 };
    }
  } catch (error) {
    console.error('Error bulk deleting from Cloudinary:', error);
    return { success: false, deletedCount: 0 };
  }
}; 