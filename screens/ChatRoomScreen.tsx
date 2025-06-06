import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  SafeAreaView, 
  FlatList, 
  Image, 
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ToastAndroid,
  Platform,
  Modal,
  ScrollView,
  Linking,
  Animated,
  Easing,
  Clipboard,
  StatusBar
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { 
  Room, 
  RoomImage, 
  getRoomImages, 
  uploadRoomImage, 
  supabase, 
  deleteRoomImage,
  deleteMultipleRoomImages
} from '../lib/supabase';
import { downloadImage, downloadMultipleImages, preloadRoomImages, initImageCache } from '../lib/imageUtils';
import { getPermissionsRequested } from '../lib/storage';
import FaceCapture from '../components/FaceCapture';
import MatchedPhotos from '../components/MatchedPhotos';
import ImagePreview from '../components/ImagePreview';
import FastImage from '../components/FastImage';

interface ChatRoomScreenProps {
  room: Room;
  userName: string;
  userId?: string;
  onExit: (shouldLeaveRoom?: boolean) => void;
}

const ChatRoomScreen: React.FC<ChatRoomScreenProps> = ({ room, userName, userId, onExit }) => {
  const [images, setImages] = useState<RoomImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [deleteProgress, setDeleteProgress] = useState(0);
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [showActionModal, setShowActionModal] = useState(false);
  const [uploadingMultiple, setUploadingMultiple] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [completedUploads, setCompletedUploads] = useState(0);
  const [showFaceCapture, setShowFaceCapture] = useState(false);
  const [showMatchedPhotos, setShowMatchedPhotos] = useState(false);
  const [matchedPhotos, setMatchedPhotos] = useState<{url: string, similarity: number}[]>([]);
  const [expiryTimeRemaining, setExpiryTimeRemaining] = useState<string>("");
  const expiryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const subscription = useRef<any>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [droplets, setDroplets] = useState<{left: number, animValue: Animated.Value, speed: number}[]>([]);
  const [roomParticipants, setRoomParticipants] = useState<string[]>([]);
  const [showParticipantsModal, setShowParticipantsModal] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('info');
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const toastAnimRef = useRef(new Animated.Value(0)).current;

  // Add animation values
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  const isRoomCreator = userName === room.created_by;

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info', duration = 3000) => {
    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.SHORT);
    } else {
      // Clear any existing timeout
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
      
      // Set the toast properties
      setToastMessage(message);
      setToastType(type);
      setToastVisible(true);
      
      // Animate the toast in
      toastAnimRef.setValue(0);
      Animated.spring(toastAnimRef, {
        toValue: 1,
        useNativeDriver: true,
        friction: 8,
        tension: 40
      }).start();
      
      // Auto-hide the toast after duration
      toastTimeoutRef.current = setTimeout(() => {
        // Animate toast out before hiding
        Animated.timing(toastAnimRef, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true
        }).start(() => {
          setToastVisible(false);
        });
      }, duration);
    }
  }, []);

  // Cleanup toast timeout on unmount
  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  // Initialize image cache system
  useEffect(() => {
    const setupCache = async () => {
      await initImageCache();
    };
    
    setupCache();
  }, []);

  // Calculate and format the remaining time
  const updateExpiryTime = () => {
    if (room.expiry_time) {
      const expiryDate = new Date(room.expiry_time);
      const now = new Date();
      const diffMs = expiryDate.getTime() - now.getTime();
      
      if (diffMs <= 0) {
        setExpiryTimeRemaining("Expired");
        // Exit room if it's expired
        Alert.alert(
          'Room Expired',
          'This room has expired and is no longer accessible.',
          [{ 
            text: 'OK',
            onPress: () => onExit(false)
          }]
        );
        return;
      }
      
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      
      if (diffHours > 0) {
        setExpiryTimeRemaining(`Expires in ${diffHours}h ${diffMinutes}m`);
      } else {
        setExpiryTimeRemaining(`Expires in ${diffMinutes}m`);
      }
    }
  };

  useEffect(() => {
    // Check if room is expired
    if (room.expiry_time) {
      updateExpiryTime();
      
      // Set up a timer to update the expiry time every minute
      expiryTimerRef.current = setInterval(updateExpiryTime, 60000);
    }
    
    loadImages();
    setupRealtimeSubscription();

    return () => {
      if (subscription.current) {
        subscription.current.unsubscribe();
        console.log('Unsubscribed from realtime updates');
      }
      
      if (expiryTimerRef.current) {
        clearInterval(expiryTimerRef.current);
      }
    };
  }, [room.id]);

  const setupRealtimeSubscription = () => {
    if (subscription.current) {
      try {
      subscription.current.unsubscribe();
      console.log('Cleaned up previous subscription');
      } catch (err) {
        console.log('Error cleaning up previous subscription:', err);
      }
    }
    
    // Use a more stable channel name that doesn't change on each render
    // Include userId to make it unique per user
    const channelName = `room-images-${room.id}-${userId || 'anonymous'}`;
    console.log(`Setting up realtime subscription for room: ${room.id} on channel: ${channelName}`);
    
    try {
    subscription.current = supabase
        .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_images',
          filter: `room_id=eq.${room.id}`
        },
        (payload) => {
          console.log('Realtime event received:', payload.eventType, payload);
          
          if (payload.eventType === 'INSERT') {
            const newImage = payload.new as RoomImage;
            
            setImages(prevImages => {
              const exists = prevImages.some(img => img.id === newImage.id);
              if (!exists) {
                if (newImage.uploaded_by !== userName) {
                  showToast(`${newImage.uploaded_by} shared a new image`);
                }
                return [newImage, ...prevImages];
              }
              return prevImages;
            });
          } 
          else if (payload.eventType === 'DELETE') {
            if (payload.old && payload.old.id) {
              const deletedImageId = payload.old.id;
              console.log('Received DELETE event for image:', deletedImageId);
              
              setImages(prevImages => {
                const deletedImage = prevImages.find(img => img.id === deletedImageId);
                
                if (deletedImage && deletedImage.uploaded_by !== userName) {
                  const deleterName = deletedImage.uploaded_by === room.created_by 
                    ? 'the room owner' 
                    : (deletedImage.uploaded_by || 'someone');
                  
                  showToast(`An image was deleted by ${deleterName}`);
                }
                
                if (selectedImages.has(deletedImageId)) {
                  setSelectedImages(prev => {
                    const newSelection = new Set(prev);
                    newSelection.delete(deletedImageId);
                    return newSelection;
                  });
                }
                
                return prevImages.filter(img => img.id !== deletedImageId);
              });
            }
          }
        }
      )
      .subscribe((status, err) => {
        console.log('Subscription status:', status);
        
        if (status === 'SUBSCRIBED') {
          console.log('Successfully subscribed to realtime updates for room:', room.id);
        } else if (status === 'CHANNEL_ERROR') {
            console.log('Error subscribing to realtime updates:', err);
            
            // Don't immediately retry - implement exponential backoff
            let retryCount = 0;
            const maxRetries = 3;
            
            if (retryCount < maxRetries) {
              const delay = Math.pow(2, retryCount) * 2000; // Exponential backoff
              retryCount++;
          
          setTimeout(() => {
                console.log(`Attempting to re-establish subscription (retry ${retryCount}/${maxRetries})`);
            setupRealtimeSubscription();
              }, delay);
            }
        } else if (status === 'TIMED_OUT') {
            console.log('Subscription timed out, not automatically reconnecting');
            // Don't automatically reconnect to avoid infinite loops
        }
      });
    } catch (error) {
      console.log('Error setting up realtime subscription:', error);
    }
  };

  const loadImages = async () => {
    setLoading(true);
    try {
      console.log('Loading images for room:', room.id);
      const roomImages = await getRoomImages(room.id);
      console.log(`Loaded ${roomImages.length} images`);
      
      // Set images immediately to update UI
      setImages(roomImages);
      
      // Preload images in the background for faster display
      if (roomImages && roomImages.length > 0) {
        setTimeout(() => {
          preloadRoomImages(room.id, roomImages)
            .catch(error => console.error('Error in background preloading:', error));
        }, 300); // Small delay to prioritize UI rendering first
      }
    } catch (error) {
      console.error('Error loading images:', error);
      showToast('Failed to load images', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handlePickImage = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const permissionsRequested = await getPermissionsRequested();
      
      if (!permissionsRequested) {
        const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (permissionResult.granted === false) {
          Alert.alert('Permission Required', 'You need to grant access to your photos to upload images.');
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.7,
        allowsMultipleSelection: true,
        selectionLimit: 10,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        if (result.assets.length > 1) {
          uploadMultipleImages(result.assets.map(asset => asset.uri));
        } else {
          uploadImage(result.assets[0].uri);
        }
      }
    } catch (err) {
      console.error('Error picking image:', err);
      Alert.alert('Error', 'Failed to pick image from gallery');
    }
  };

  const handleTakePhoto = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const permissionsRequested = await getPermissionsRequested();
      
      if (!permissionsRequested) {
        const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
        if (permissionResult.granted === false) {
          Alert.alert('Permission Required', 'You need to grant access to your camera to take photos.');
          return;
        }
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.7,
        allowsMultipleSelection: Platform.OS === 'ios',
        selectionLimit: 5,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        if (result.assets.length > 1) {
          uploadMultipleImages(result.assets.map(asset => asset.uri));
        } else {
          uploadImage(result.assets[0].uri);
        }
      }
    } catch (err) {
      console.error('Error taking photo:', err);
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const uploadMultipleImages = async (uris: string[]) => {
    if (uris.length === 0) return;
    
    setUploading(true);
    setUploadProgress(0);
    setUploadingMultiple(true);
    setUploadingCount(uris.length);
    setCompletedUploads(0);
    
    try {
      let completedUploads = 0;
      let failedUploads = 0;
      const totalUploads = uris.length;
      
      // Accelerate progress simulation for perceived speed
      const progressTimer = setInterval(() => {
        setUploadProgress(prev => {
          // More aggressive progression to appear faster
          if (prev < 0.95) {
            return prev + (0.95 - prev) * 0.15; 
          }
          return prev;
        });
      }, 150);
      
      // Process images in smaller batches to not overwhelm the network
      const batchSize = 2; // Process 2 images at a time
      
      // Keep track of retries for each URI
      const retries = new Map<string, number>();
      const maxRetries = 3;
      
      // Queue of URIs to process
      const queue = [...uris];
      
      while (queue.length > 0) {
        // Take a batch from the queue
        const batch = queue.splice(0, batchSize);
        
        // Process this batch with retry logic
        const batchResults = await Promise.allSettled(
          batch.map(async (uri) => {
        try {
              console.log(`Uploading image: ${uri.substring(0, 50)}...`);
          const newImage = await uploadRoomImage(room.id, uri, userName, 0.7);
          completedUploads++;
          setCompletedUploads(completedUploads);
              setUploadProgress((completedUploads + failedUploads) / totalUploads);
          return newImage;
        } catch (error) {
              console.error(`Error uploading image:`, error);
              
              // Implement retry logic
              const currentRetries = retries.get(uri) || 0;
              if (currentRetries < maxRetries) {
                // Put back in queue with increased retry count
                retries.set(uri, currentRetries + 1);
                queue.push(uri);
                console.log(`Queued retry ${currentRetries + 1}/${maxRetries} for image`);
                return null;
              } else {
                // Max retries exceeded
                failedUploads++;
                setUploadProgress((completedUploads + failedUploads) / totalUploads);
                console.log(`Failed to upload image after ${maxRetries} attempts`);
          return null;
        }
            }
          })
        );
        
        // Add a small delay between batches to avoid overwhelming the network
        if (queue.length > 0) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      
      clearInterval(progressTimer);
      setUploadProgress(1);
      
      const successfulUploads = completedUploads;
      
      if (successfulUploads === totalUploads) {
        showToast(`Uploaded ${successfulUploads} photos to "${room.name}"`, 'success');
      } else if (successfulUploads > 0) {
        showToast(`Uploaded ${successfulUploads}/${totalUploads} photos to "${room.name}"`, 'success');
      } else {
        showToast('Failed to upload images. Please try again.', 'error');
      }
    } catch (error) {
      console.error('Error in batch upload:', error);
      showToast('An error occurred during the batch upload', 'error');
    } finally {
      setTimeout(() => {
        setUploading(false);
        setUploadProgress(0);
        setUploadingMultiple(false);
      }, 500);
    }
  };

  const uploadImage = async (uri: string) => {
    setUploading(true);
    setUploadProgress(0);
    setUploadingMultiple(false);
    
    try {
      // Accelerate progress simulation for perceived speed
      const progressTimer = setInterval(() => {
        setUploadProgress(prev => {
          // More aggressive progression to appear faster
          if (prev < 0.95) {
            return prev + (0.95 - prev) * 0.15; 
          }
          return prev;
        });
      }, 150);
      
      // This won't block the UI thread completely
      const newImage = await uploadRoomImage(room.id, uri, userName, 0.7);
      
      clearInterval(progressTimer);
      setUploadProgress(1);
      
      if (newImage) {
        showToast(`Uploaded 1 photo to "${room.name}"`, 'success');
      } else {
        showToast('Failed to upload image. Please try again.', 'error');
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      showToast('Failed to upload image. Please try again.', 'error');
    } finally {
      setTimeout(() => {
        setUploading(false);
        setUploadProgress(0);
      }, 500);
    }
  };

  // Setup pulse animation
  useEffect(() => {
    if (uploading) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true
          })
        ])
      ).start();
      
      // Reset progress animation
      progressAnim.setValue(0);
    } else {
      // Stop animation when not uploading
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
    
    return () => {
      pulseAnim.stopAnimation();
    };
  }, [uploading]);
  
  // Update progress animation when uploadProgress changes
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: uploadProgress,
      duration: 300,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false
    }).start();
  }, [uploadProgress]);

  // Create droplet effect for progress bar
  useEffect(() => {
    if (uploading) {
      // Create random water droplets for animation
      const newDroplets = Array(5).fill(0).map(() => ({
        left: Math.random() * 80, // Random position along progress bar (0-80%)
        animValue: new Animated.Value(0),
        speed: 0.5 + Math.random() * 1.5, // Random speed
      }));
      
      setDroplets(newDroplets);
      
      // Animate each droplet
      newDroplets.forEach(droplet => {
        Animated.loop(
          Animated.timing(droplet.animValue, {
            toValue: 1,
            duration: 2000 / droplet.speed,
            easing: Easing.linear,
            useNativeDriver: true,
          })
        ).start();
      });
    } else {
      // Clean up animations
      droplets.forEach(droplet => {
        droplet.animValue.stopAnimation();
      });
      setDroplets([]);
    }
    
    return () => {
      droplets.forEach(droplet => {
        droplet.animValue.stopAnimation();
      });
    };
  }, [uploading]);

  const toggleSelectionMode = () => {
    setSelectionMode(!selectionMode);
    setSelectedImages(new Set());
  };

  const toggleImageSelection = (imageId: string) => {
    const newSelection = new Set(selectedImages);
    if (newSelection.has(imageId)) {
      newSelection.delete(imageId);
    } else {
      newSelection.add(imageId);
    }
    setSelectedImages(newSelection);
  };

  const openAndroidSettings = async (): Promise<void> => {
    if (Platform.OS === 'android') {
      try {
        await Linking.openSettings();
      } catch (error) {
        console.error('Could not open settings:', error);
      }
    }
  };

  const handleDownloadImage = async (imageUrl: string) => {
    try {
      setDownloadingAll(true);
      setDownloadProgress(0.1);
      
      if (Platform.OS === 'android') {
        console.log(`Starting single image download on Android: ${imageUrl}`);
      }
      
      const result = await downloadImage(imageUrl);
      
      setDownloadProgress(1);
      
      setTimeout(() => {
        setDownloadingAll(false);
        setDownloadProgress(0);
        
        if (result.success) {
          showToast('Image saved to your device', 'success');
        } else {
          if (Platform.OS === 'android' && result.permissionDenied) {
            showToast('Permission denied to save image', 'error');
          } else {
            showToast('Failed to save image to your device', 'error');
          }
        }
      }, 500);
    } catch (error) {
      console.error('Error downloading image:', error);
      setDownloadingAll(false);
      setDownloadProgress(0);
      showToast('An error occurred while saving the image', 'error');
    }
  };

  const handleDownloadSelectedImages = async () => {
    try {
      setDownloadingAll(true);
      setDownloadProgress(0.1);
      
      let imagesToDownload: RoomImage[] = [];
      
      if (selectedImages.size > 0) {
        imagesToDownload = images.filter(img => selectedImages.has(img.id || ''));
      } else {
        imagesToDownload = images.filter(img => img.uploaded_by !== userName);
      }
      
      setDownloadProgress(0.2);
      
      const totalImages = imagesToDownload.length;
      
      if (totalImages === 0) {
        setDownloadingAll(false);
        setDownloadProgress(0);
        showToast('No images to download');
        return;
      }
      
      if (Platform.OS === 'android') {
        console.log(`Starting batch download of ${totalImages} images on Android`);
      }
      
      // This won't block the UI thread completely
      downloadMultipleImages(imagesToDownload).then(result => {
      setDownloadProgress(1);
      
      setTimeout(() => {
        setDownloadingAll(false);
        setDownloadProgress(0);
        
        if (result.success) {
          if (result.count === totalImages) {
              showToast(`All ${result.count} images saved to your device`, 'success');
          } else {
              showToast(`${result.count} of ${totalImages} images saved to your device`, 'success');
          }
        } else {
          if (Platform.OS === 'android' && result.permissionDenied) {
            showToast('Permission denied to save images', 'error');
          } else {
              showToast('Failed to save images to your device', 'error');
          }
        }
        
        setSelectionMode(false);
        setSelectedImages(new Set());
      }, 800);
      }).catch(error => {
      console.error('Error downloading images:', error);
      setDownloadingAll(false);
      setDownloadProgress(0);
        showToast('An error occurred while saving the images', 'error');
      });
    } catch (error) {
      console.error('Error initiating download:', error);
      setDownloadingAll(false);
      setDownloadProgress(0);
      showToast('An error occurred while saving the images', 'error');
    }
  };

  const handleDeleteImage = async (image: RoomImage) => {
    if (image.uploaded_by !== userName && !isRoomCreator) {
      showToast('You can only delete images you uploaded', 'error');
      return;
    }

    if (!image.id) {
      showToast('Cannot delete this image: missing ID', 'error');
      return;
    }

    const imageId = image.id;

    Alert.alert(
      'Delete Image',
      'Are you sure you want to delete this image?',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeleting(true);
              setDeleteProgress(0.5);
              
              // Remove from UI immediately for better user experience
              setImages(prevImages => 
                prevImages.filter(img => img.id !== imageId)
              );
              
              // Delete in background - won't block the UI
              deleteRoomImage(imageId).then(success => {
              if (success) {
                  showToast('Image deleted successfully', 'success');
              } else {
                  showToast('Could not delete the image', 'error');
                  // Refresh images if delete failed
                loadImages();
              }
              
              setTimeout(() => {
                setDeleting(false);
                setDeleteProgress(0);
              }, 500);
              }).catch(error => {
              console.error('Error deleting image:', error);
              setDeleting(false);
              setDeleteProgress(0);
                showToast('An error occurred while deleting the image', 'error');
              loadImages();
              });
            } catch (error) {
              console.error('Error initiating delete:', error);
              setDeleting(false);
              setDeleteProgress(0);
              showToast('An error occurred while deleting the image', 'error');
            }
          }
        }
      ],
      { cancelable: true }
    );
  };

  const handleDeleteSelectedImages = async () => {
    const selectedImagesArray = images.filter(img => selectedImages.has(img.id || ''));
    
    if (selectedImagesArray.length === 0) {
      showToast('No images selected. Please select at least one image.', 'info');
      return;
    }
    
    const unauthorizedImages = selectedImagesArray.filter(
      img => img.uploaded_by !== userName && !isRoomCreator
    );
    
    if (unauthorizedImages.length > 0 && !isRoomCreator) {
      showToast('You can only delete images you uploaded. Please deselect other users\' images.', 'error');
      return;
    }

    Alert.alert(
      'Delete Images',
      `Are you sure you want to delete ${selectedImages.size} selected images?`,
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeleting(true);
              setDeleteProgress(0);
              
              // Create animated progress for deletion
              const progressTimer = setInterval(() => {
                setDeleteProgress(prev => {
                  if (prev < 0.95) {
                    return prev + (0.95 - prev) * 0.15;
                  }
                  return prev;
                });
              }, 150);
              
              const imageIds = selectedImagesArray
                .map(img => img.id)
                .filter(id => id !== undefined) as string[];
              
              if (imageIds.length === 0) {
                showToast('No valid image IDs to delete', 'error');
                setDeleting(false);
                return;
              }
              
              console.log(`Deleting ${imageIds.length} images`);
              
              // Remove from UI immediately for better user experience
              setImages(prevImages => 
                prevImages.filter(img => img.id && !imageIds.includes(img.id))
              );
              
              // The actual deletion runs in the background and won't block navigation
              deleteMultipleRoomImages(imageIds).then(success => {
                clearInterval(progressTimer);
              setDeleteProgress(1);
              
              if (success) {
                  showToast(`${imageIds.length} images deleted successfully`, 'success');
                setSelectionMode(false);
                setSelectedImages(new Set());
              } else {
                  showToast('Some or all images could not be deleted', 'error');
                loadImages();
              }
              
              setTimeout(() => {
                setDeleting(false);
                setDeleteProgress(0);
              }, 500);
              }).catch(error => {
              console.error('Error deleting images:', error);
                clearInterval(progressTimer);
              setDeleting(false);
              setDeleteProgress(0);
                showToast('An error occurred while deleting the images', 'error');
              loadImages();
              });
            } catch (error) {
              console.error('Error initiating bulk delete:', error);
              setDeleting(false);
              setDeleteProgress(0);
              showToast('An error occurred while deleting the images', 'error');
            }
          }
        }
      ],
      { cancelable: true }
    );
  };

  const handleDeleteAllImages = async () => {
    if (!isRoomCreator) {
      showToast('Only the room creator can delete all images', 'error');
      return;
    }

    Alert.alert(
      'Delete All Images',
      'Are you sure you want to delete ALL images in this room?',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeleting(true);
              setDeleteProgress(0.5);
              
              const allImageIds = images
                .map(img => img.id)
                .filter(id => id !== undefined) as string[];
              
              if (allImageIds.length === 0) {
                setDeleting(false);
                showToast('No images to delete', 'info');
                return;
              }
              
              console.log(`Deleting all ${allImageIds.length} images`);
              
              setImages([]);
              
              const success = await deleteMultipleRoomImages(allImageIds);
              
              setDeleteProgress(1);
              
              if (success) {
                showToast(`All ${allImageIds.length} images deleted successfully`, 'success');
              } else {
                showToast('Some or all images could not be deleted', 'error');
                loadImages();
              }
              
              setTimeout(() => {
                setDeleting(false);
                setDeleteProgress(0);
              }, 500);
            } catch (error) {
              console.error('Error deleting all images:', error);
              setDeleting(false);
              setDeleteProgress(0);
              showToast('An error occurred while deleting images', 'error');
              loadImages();
            }
          }
        }
      ],
      { cancelable: true }
    );
  };

  const handleMatchFound = (matches: {url: string, similarity: number}[]) => {
    console.log('Face matches found:', matches);
    setMatchedPhotos(matches);
    setShowMatchedPhotos(true);
  };

  const copyRoomCode = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Clipboard.setString(room.id);
    showToast('Room code copied to clipboard', 'success');
  };

  const renderActionModal = () => (
    <Modal
      visible={showActionModal}
      transparent={true}
      animationType="slide"
      onRequestClose={() => setShowActionModal(false)}
    >
      <TouchableOpacity 
        style={styles.modalOverlay} 
        activeOpacity={1} 
        onPress={() => setShowActionModal(false)}
      >
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHandleBar} />
            <Text style={styles.modalTitle}>Actions</Text>
          </View>
          
          <ScrollView 
            style={styles.actionList}
            contentContainerStyle={styles.actionListContent}
            showsVerticalScrollIndicator={false}
          >
            <TouchableOpacity 
              style={styles.actionItem}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowActionModal(false);
                setShowFaceCapture(true);
              }}
            >
              <View style={[styles.actionIconContainer, { backgroundColor: `${COLORS.accent}20` }]}>
                <Ionicons name="person-circle-outline" size={22} color={COLORS.accent} />
              </View>
              <Text style={styles.actionText}>Find My Photos</Text>
            </TouchableOpacity>
            
            {images.length > 0 && (
              <>
                <View style={styles.actionDivider} />
                
                <TouchableOpacity 
                  style={styles.actionItem}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowActionModal(false);
                    toggleSelectionMode();
                  }}
                >
                  <View style={[styles.actionIconContainer, { backgroundColor: `${COLORS.secondary}20` }]}>
                    <Ionicons 
                      name={selectionMode ? "checkmark-circle-outline" : "albums-outline"} 
                      size={22} 
                      color={COLORS.secondary} 
                    />
                  </View>
                  <Text style={styles.actionText}>
                    {selectionMode ? "Cancel Selection" : "Select Images"}
                  </Text>
                </TouchableOpacity>
                
                {images.length > 0 && (
                  <TouchableOpacity 
                    style={styles.actionItem}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setShowActionModal(false);
                      handleDownloadSelectedImages();
                    }}
                  >
                    <View style={[styles.actionIconContainer, { backgroundColor: `${COLORS.primary}20` }]}>
                      <Ionicons name="cloud-download-outline" size={22} color={COLORS.primary} />
                    </View>
                    <Text style={styles.actionText}>
                      {selectedImages.size > 0 
                        ? `Download ${selectedImages.size} Selected Images` 
                        : "Download All Images (Except Yours)"}
                    </Text>
                  </TouchableOpacity>
                )}
                
                {isRoomCreator && (
                  <TouchableOpacity 
                    style={[styles.actionItem, { marginBottom: 0 }]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      setShowActionModal(false);
                      handleDeleteAllImages();
                    }}
                  >
                    <View style={[styles.actionIconContainer, { backgroundColor: '#FEE2E2' }]}>
                      <Ionicons name="trash-bin-outline" size={22} color="#EF4444" />
                    </View>
                    <Text style={styles.actionText}>Delete All Images</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );

  const renderImage = ({ item, index }: { item: RoomImage, index: number }) => {
    const isSelected = selectedImages.has(item.id || '');
    
    return (
      <View style={styles.imageContainer}>
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => {
            if (selectionMode) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              toggleImageSelection(item.id || '');
            } else {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              console.log(`Opening preview for image at index ${index}:`, item.image_url);
              
              // Just set the index and show the preview
              setPreviewIndex(index);
              setPreviewVisible(true);
            }
          }}
          onLongPress={() => {
            if (!selectionMode) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              toggleSelectionMode();
              toggleImageSelection(item.id || '');
            }
          }}
        >
          <FastImage
            source={{ uri: item.image_url }}
            style={styles.image}
            resizeMode="cover"
            priority="normal"
            fallback={true}
          />
          
          {selectionMode && (
            <View style={[
              styles.selectionIndicator,
              isSelected ? styles.selectedIndicator : {}
            ]}>
              {isSelected && (
                <Ionicons name="checkmark" size={20} color="#fff" />
              )}
            </View>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  const handleLeaveRoom = () => {
    Alert.alert(
      'Leave Room',
      'Are you sure you want to leave this room? The room will be removed from your list.',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: () => onExit(true)
        }
      ],
      { cancelable: true }
    );
  };

  const handleBackToRoomList = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onExit(false);
  };

  const renderDroplets = () => {
    return droplets.map((droplet, index) => {
      // Droplet moves from left to right along the progress bar
      const translateX = droplet.animValue.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 150], // Move further for more dynamic effect
      });
      
      // Add vertical movement for more natural feel
      const translateY = droplet.animValue.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0, 2 * (Math.random() > 0.5 ? 1 : -1), 0],
      });
      
      // Vary size for more natural appearance
      const scale = droplet.animValue.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0.7, 1.2, 0.7],
      });

  return (
        <Animated.View 
          key={index}
          style={[
            styles.droplet,
            {
              left: `${droplet.left}%`,
              transform: [
                { translateX },
                { translateY },
                { scale }
              ],
              opacity: droplet.animValue.interpolate({
                inputRange: [0, 0.2, 0.8, 1],
                outputRange: [0, 0.9, 0.9, 0], // Brighter droplets
              }),
            }
          ]}
        />
      );
    });
  };

  // Add this function to get unique participants from images
  const getUniqueParticipants = () => {
    const participants = new Set<string>();
    
    // Add the current user
    participants.add(userName);
    
    // Add the room creator if different from current user
    if (room.created_by && room.created_by !== userName) {
      participants.add(room.created_by);
    }
    
    // Add all users who uploaded images
    images.forEach(image => {
      if (image.uploaded_by && !participants.has(image.uploaded_by)) {
        participants.add(image.uploaded_by);
      }
    });
    
    return Array.from(participants);
  };
  
  // Update participants list when images change
  useEffect(() => {
    setRoomParticipants(getUniqueParticipants());
  }, [images]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      
      {/* Header with blue background */}
      <LinearGradient
        colors={[COLORS.primary, COLORS.secondary]}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        <SafeAreaView style={{ backgroundColor: 'transparent' }}>
          <View style={styles.headerContent}>
            <TouchableOpacity 
              style={styles.backButton} 
              onPress={handleBackToRoomList}
            >
              <Ionicons name="arrow-back" size={24} color={COLORS.white} />
            </TouchableOpacity>
            
            <View style={styles.roomInfoContainer}>
              <Text style={styles.roomName}>{room.name}</Text>
              <View style={styles.roomInfoRow}>
                <TouchableOpacity 
                  style={styles.codeContainer}
                  onPress={copyRoomCode}
                  activeOpacity={0.7}
                >
                  <Text style={styles.roomCode}>Code: {room.id}</Text>
                  <Ionicons name="copy-outline" size={12} color="rgba(255,255,255,0.7)" style={styles.copyIcon} />
                </TouchableOpacity>
                
                {expiryTimeRemaining && (
                  <View style={styles.expiryContainer}>
                    <Ionicons name="time-outline" size={12} color={COLORS.white} style={styles.expiryIcon} />
                    <Text style={styles.expiryText}>{expiryTimeRemaining}</Text>
                  </View>
                )}
              </View>
            </View>
            
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowActionModal(true);
              }}
            >
              <Ionicons name="ellipsis-vertical" size={24} color={COLORS.white} />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>
      
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.white }}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading images...</Text>
          </View>
        ) : (
          <>
            {images.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="images-outline" size={64} color="#CBD5E1" />
                <Text style={styles.emptyTitle}>No images yet</Text>
                <Text style={styles.emptyDescription}>Share the first image in this room</Text>
                
                <View style={styles.emptyButtons}>
                  <TouchableOpacity 
                    style={[styles.emptyButton, { backgroundColor: COLORS.primary }]}
                    onPress={handlePickImage}
                  >
                    <Ionicons name="images-outline" size={28} color="#fff" />
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={[styles.emptyButton, { backgroundColor: COLORS.secondary }]}
                    onPress={handleTakePhoto}
                  >
                    <Ionicons name="camera-outline" size={28} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <FlatList
                data={images}
                renderItem={renderImage}
                keyExtractor={item => item.id || ''}
                numColumns={2}
                contentContainerStyle={styles.imageListContainer}
                columnWrapperStyle={styles.imageRow}
                showsVerticalScrollIndicator={false}
                initialNumToRender={8}
                maxToRenderPerBatch={12}
                windowSize={11}
                removeClippedSubviews={true}
              />
            )}
          </>
        )}
      </SafeAreaView>
      
      {/* Floating action button */}
      {images.length > 0 && !loading && !uploading && !deleting && !downloadingAll && !selectionMode && (
        <TouchableOpacity 
          style={styles.fabButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            Alert.alert(
              'Add Photo',
              'Choose how you want to add photos',
              [
                {
                  text: 'Take Photo',
                  onPress: handleTakePhoto
                },
                {
                  text: 'Choose from Library',
                  onPress: handlePickImage
                },
                {
                  text: 'Cancel',
                  style: 'cancel'
                }
              ]
            );
          }}
        >
          <LinearGradient
            colors={[COLORS.primary, COLORS.secondary]}
            style={styles.fabGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Ionicons name="add" size={30} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      )}
      
      {uploading && (
        <View style={styles.overlayContainer}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <ActivityIndicator size="small" color="#8B5CF6" style={{ marginRight: 10 }} />
            <Text style={[styles.uploadText, { color: '#fff', fontSize: 14 }]}>
              {uploadingMultiple 
                ? `Uploading ${completedUploads}/${uploadingCount} images...` 
                : 'Uploading image...'}
            </Text>
          </View>
          <View style={styles.progressBarContainer}>
            <Animated.View 
              style={[
                styles.progressBarBackground,
                { width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%']
                }) }
              ]} 
            >
              <LinearGradient
                colors={[COLORS.primary, COLORS.secondary, COLORS.accent]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.progressBarGradient}
              />
              {renderDroplets()}
            </Animated.View>
          </View>
        </View>
      )}
      
      {renderActionModal()}
      
      <FaceCapture
        visible={showFaceCapture}
        onClose={() => setShowFaceCapture(false)}
        roomImages={images}
        onMatchFound={handleMatchFound}
      />
      
      <MatchedPhotos
        visible={showMatchedPhotos}
        onClose={() => setShowMatchedPhotos(false)}
        photos={matchedPhotos}
        onImagePress={async (url) => {
          // Download without showing permission prompt
          const result = await downloadImage(url);
          if (result.success) {
            showToast('Image saved to your device', 'success');
          } else if (result.permissionDenied) {
            showToast('Permission denied to save image', 'error');
          } else {
            showToast('Failed to save image', 'error');
          }
        }}
      />
      
      {images.length > 0 && (
        <ImagePreview
          visible={previewVisible}
          images={images}
          initialIndex={previewIndex}
          onClose={() => {
            console.log('Closing image preview');
            setPreviewVisible(false);
          }}
        />
      )}
      
      {/* Participants List Modal */}
      <Modal
        visible={showParticipantsModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowParticipantsModal(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setShowParticipantsModal(false)}
        >
          <View style={styles.participantsModalContent}>
            <LinearGradient
              colors={['#FFFFFF', '#F8FAFC', '#F1F5F9']}
              style={styles.participantsModalGradient}
            >
              <Text style={styles.participantsModalTitle}>Room Participants</Text>
              
              <ScrollView style={styles.participantsList}>
                {roomParticipants.map((participant) => (
                  <View key={participant} style={styles.participantItem}>
                    <View style={[styles.participantCircle, styles.participantCircleLarge]}>
                      <Text style={styles.participantInitialLarge}>
                        {participant.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.participantName}>
                      {participant === userName ? `${participant} (You)` : participant}
                    </Text>
                    {participant === room.created_by && (
                      <View style={styles.creatorBadge}>
                        <Text style={styles.creatorBadgeText}>Creator</Text>
                      </View>
                    )}
                  </View>
                ))}
              </ScrollView>
              
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowParticipantsModal(false);
                }}
              >
                <Text style={styles.closeButtonText}>Close</Text>
              </TouchableOpacity>
            </LinearGradient>
          </View>
        </TouchableOpacity>
      </Modal>
      
      {/* Selection mode controls */}
      {selectionMode && (
        <View style={styles.selectionControls}>
          <TouchableOpacity 
            style={styles.selectionButton} 
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              toggleSelectionMode();
            }}
          >
            <Text style={styles.selectionButtonText}>Cancel</Text>
          </TouchableOpacity>
          
          <Text style={styles.selectionCount}>
            {selectedImages.size} selected
          </Text>
          
          <View style={styles.selectionActions}>
            {selectedImages.size > 0 ? (
              <>
                <TouchableOpacity 
                  style={styles.selectionAction}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    handleDownloadSelectedImages();
                  }}
                >
                  <Ionicons name="download-outline" size={24} color={COLORS.accent} />
                </TouchableOpacity>
                
                {(isRoomCreator || images.filter(img => selectedImages.has(img.id || '') && img.uploaded_by === userName).length === selectedImages.size) && (
                  <TouchableOpacity 
                    style={styles.selectionAction}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      handleDeleteSelectedImages();
                    }}
                  >
                    <Ionicons name="trash-outline" size={24} color="#EF4444" />
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <>
                <TouchableOpacity 
                  style={styles.selectionAction}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    handleDownloadSelectedImages();
                  }}
                >
                  <Ionicons name="download-outline" size={24} color={COLORS.accent} />
                  <Text style={styles.selectionActionText}>Download All</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      )}
      
      {/* Custom Toast for iOS */}
      {Platform.OS === 'ios' && toastVisible && (
        <Animated.View 
          style={[
            styles.customToast,
            { 
              backgroundColor: 
                toastType === 'success' ? 'rgba(16, 185, 129, 0.95)' : 
                toastType === 'error' ? 'rgba(239, 68, 68, 0.95)' : 
                'rgba(59, 130, 246, 0.95)',
              transform: [
                { translateY: toastAnimRef.interpolate({
                    inputRange: [0, 1],
                    outputRange: [50, 0]
                  })
                },
                { scale: toastAnimRef.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0.8, 1.05, 1]
                  })
                }
              ],
              opacity: toastAnimRef
            }
          ]}
        >
          <Ionicons 
            name={
              toastType === 'success' ? 'checkmark-circle' : 
              toastType === 'error' ? 'alert-circle' : 
              'information-circle'
            } 
            size={20} 
            color="white" 
            style={styles.toastIcon}
          />
          <Text style={styles.toastText}>{toastMessage}</Text>
        </Animated.View>
      )}
    </View>
  );
};

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  header: {
    width: '100%',
    paddingTop: Platform.OS === 'ios' ? 0 : StatusBar.currentHeight || 0,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
  backButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  actionButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  roomName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.white,
    textAlign: 'center',
    marginBottom: 4,
  },
  roomInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  roomCode: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
  },
  copyIcon: {
    marginLeft: 4,
  },
  expiryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  expiryIcon: {
    marginRight: 4,
  },
  expiryText: {
    fontSize: 11,
    color: COLORS.white,
  },
  imageListContainer: {
    padding: 12,
    paddingBottom: 100,
  },
  imageContainer: {
    width: '48%',
    aspectRatio: 1,
    margin: '1%',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: COLORS.lightBg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  imageRow: {
    justifyContent: 'space-between',
  },
  fabButton: {
    position: 'absolute',
    bottom: 30,
    alignSelf: 'center',
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 100,
  },
  fabGradient: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: COLORS.gray,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 24,
  },
  emptyDescription: {
    fontSize: 14,
    color: COLORS.gray,
    marginTop: 8,
    textAlign: 'center',
  },
  emptyButtons: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 32,
  },
  emptyButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  selectionIndicator: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedIndicator: {
    backgroundColor: COLORS.accent,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 5,
  },
  modalHeader: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: 'white',
  },
  modalHandleBar: {
    width: 36,
    height: 5,
    backgroundColor: '#CBD5E1',
    borderRadius: 3,
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
  },
  actionList: {
    paddingHorizontal: 20,
    backgroundColor: 'white',
  },
  actionListContent: {
    paddingTop: 12,
    paddingBottom: 0,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  actionIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    fontSize: 16,
    color: COLORS.text,
    marginLeft: 16,
    fontWeight: '500',
  },
  actionDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 8,
  },
  closeModalButton: {
    marginTop: 8,
    marginHorizontal: 20,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  closeModalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  overlayContainer: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    left: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 1000,
  },
  uploadText: {
    marginTop: 16,
    fontSize: 16,
    color: '#1E293B',
  },
  progressBarContainer: {
    width: '100%',
    height: 10,
    backgroundColor: '#E2E8F0',
    borderRadius: 5,
    marginTop: 16,
    overflow: 'hidden',
  },
  progressBarBackground: {
    height: '100%',
    overflow: 'hidden',
    borderRadius: 5,
    position: 'relative',
  },
  progressBarGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  droplet: {
    position: 'absolute',
    width: 8,
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 4,
    top: 1,
  },
  deleteText: {
    marginTop: 16,
    fontSize: 16,
    color: '#1E293B',
  },
  downloadText: {
    marginTop: 16,
    fontSize: 16,
    color: '#1E293B',
  },
  uploadingSubtext: {
    marginTop: 8,
    fontSize: 14,
    color: '#64748B',
  },
  selectionControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  selectionButton: {
    padding: 8,
  },
  selectionButtonText: {
    fontSize: 14,
    color: '#64748B',
  },
  selectionCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },
  selectionActions: {
    flexDirection: 'row',
  },
  selectionAction: {
    padding: 8,
    marginLeft: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectionActionText: {
    fontSize: 14,
    color: '#3B82F6',
    marginLeft: 4,
  },
  participantsModalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    maxHeight: '70%',
  },
  participantsModalGradient: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  participantsModalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 16,
    marginTop: 20,
    textAlign: 'center',
  },
  participantsList: {
    padding: 20,
    maxHeight: 300,
  },
  participantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
  },
  participantCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'white',
  },
  participantInitial: {
    fontSize: 11,
    fontWeight: 'bold',
    color: 'white',
  },
  moreParticipants: {
    backgroundColor: 'rgba(59, 130, 246, 0.8)',
    marginLeft: -10,
  },
  showParticipantsButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    borderWidth: 1.5,
    borderColor: 'white',
  },
  participantCircleLarge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EDE9FE',
    borderColor: '#C4B5FD',
  },
  participantInitialLarge: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#8B5CF6',
  },
  participantName: {
    fontSize: 16,
    color: '#1E293B',
    marginLeft: 12,
    flex: 1,
  },
  creatorBadge: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  creatorBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8B5CF6',
  },
  closeButton: {
    marginTop: 8,
    marginHorizontal: 20,
    padding: 16,
    backgroundColor: '#6366F1',
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  customToast: {
    position: 'absolute',
    bottom: 90,
    left: 24,
    right: 24,
    padding: 14,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
    zIndex: 9999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  toastText: {
    color: 'white',
    fontSize: 15,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.1)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  toastIcon: {
    marginRight: 10,
  },
  roomInfoContainer: {
    flex: 1,
    marginHorizontal: 12,
    alignItems: 'center',
  },
});

export default ChatRoomScreen; 