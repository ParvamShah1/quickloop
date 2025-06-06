import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  Alert
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import { RoomImage } from '../lib/supabase';

// Define the API response structure
interface FaceMatchResult {
  image_url: string;
  image_index: number;
  best_similarity: number;
  best_distance: number;
  is_match: boolean;
  total_faces_in_image: number;
}

interface FaceMatchResponse {
  image_best_matches?: FaceMatchResult[];
  errors?: any[];
  total_processed?: number;
  detail?: string | any[];  // FastAPI error format
  message?: string;         // Generic error message
}

interface FaceCaptureProps {
  visible: boolean;
  onClose: () => void;
  roomImages: RoomImage[];
  onMatchFound: (matchedImages: {url: string, similarity: number}[]) => void;
}

const FaceCapture: React.FC<FaceCaptureProps> = ({ 
  visible, 
  onClose, 
  roomImages,
  onMatchFound
}) => {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const cameraRef = useRef<any>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [loadingMessage, setLoadingMessage] = useState("Searching for your face in all room photos...");

  // Request camera permission
  React.useEffect(() => {
    (async () => {
      if (visible) {
        if (permission) {
          setHasPermission(permission.granted);
        } else {
          const result = await requestPermission();
          setHasPermission(result.granted);
        }
        
        if (permission && !permission.granted) {
          Alert.alert(
            'Permission Required',
            'Camera access is needed to capture your face for photo matching.',
            [{ text: 'OK', onPress: onClose }]
          );
        }
      }
    })();
  }, [visible, permission]);

  const takePicture = async () => {
    if (cameraRef.current) {
      try {
        // Add a short delay to ensure camera is ready
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.7,
        });
        
        console.log("Photo taken:", photo);
        setCapturedImage(photo.uri);
      } catch (error) {
        console.error('Error taking picture:', error);
        Alert.alert('Error', 'Failed to capture image. Please try again.');
      }
    }
  };

  const resetCapture = () => {
    setCapturedImage(null);
  };

  const findMyPhotos = async () => {
    if (!capturedImage) return;
    
    setLoading(true);
    
    // Set up a timer to track how long the request is taking
    const startTime = Date.now();
    let timeElapsed = 0;
    
    const timerInterval = setInterval(() => {
      timeElapsed = Math.floor((Date.now() - startTime) / 1000);
      // Update loading message based on time elapsed
      if (timeElapsed > 15) {
        setLoadingMessage(`Still searching... (${timeElapsed}s)`);
      } else if (timeElapsed > 5) {
        setLoadingMessage(`Matching your face... (${timeElapsed}s)`);
      }
    }, 1000);
    
    try {
      // Validate we have images to process
      if (!roomImages || roomImages.length === 0) {
        throw new Error('No room images available to search');
      }
      
      // Get base64 image data for the captured face
      const base64Image = await FileSystem.readAsStringAsync(capturedImage, {
        encoding: FileSystem.EncodingType.Base64,
      });
      
      // Extract image URLs from room images
      const imageUrls = roomImages.map(img => img.image_url);
      
      console.log('Sending face image:', capturedImage);
      console.log('With room images count:', roomImages.length);
      
      // Create an AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);
      
      try {
        // Make request to face matching API with JSON data
        const response = await fetch('https://face-recognition-api-970501065345.asia-south1.run.app/match_faces/', {
          method: 'POST',
          body: JSON.stringify({
            captured: base64Image,
            images: imageUrls
          }),
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          signal: controller.signal
        });
        
        // Clear the timeout and timer
        clearTimeout(timeoutId);
        clearInterval(timerInterval);
        
        // Log the response status for debugging
        console.log('API Response status:', response.status);
        console.log('API Response headers:', response.headers);
        
        // Get the response text
        const responseText = await response.text();
        console.log('API Response text:', responseText);
        // Parse the response as JSON if it's valid
        let result: FaceMatchResponse;
        try {
          result = JSON.parse(responseText);
        } catch (e) {
          console.error('Failed to parse JSON response:', e);
          console.error('Raw response:', responseText);
          throw new Error('Invalid response from server. Please try again.');
        }
        
        if (response.ok) {
          console.log('Face matching result:', result);
          
          if (result.image_best_matches && result.image_best_matches.length > 0) {
            // Log match details
            console.log(`Found ${result.image_best_matches.length} matches:`, result.image_best_matches);
            
            // Transform the data to match the expected format
            const formattedMatches = result.image_best_matches.map((match: FaceMatchResult) => ({
              url: match.image_url,
              similarity: match.best_similarity
            }));
            
            // Call the callback with matched images
            onMatchFound(formattedMatches);
            onClose(); // Close the modal
          } else {
            // Check if there were processing errors
            const errorInfo = result.errors ? `\n\nProcessing errors: ${result.errors.length}` : '';
            Alert.alert(
              'No Matches Found', 
              `No photos containing your face were found in this room.${errorInfo}\n\nProcessed: ${result.total_processed || 0} images`
            );
          }
        } else {
          // Handle FastAPI error format (uses 'detail' field)
          const errorDetail = result?.detail;
          const errorMessage = typeof errorDetail === 'string' 
            ? errorDetail 
            : Array.isArray(errorDetail) 
              ? JSON.stringify(errorDetail) 
              : result?.message || `HTTP ${response.status}: Failed to match faces`;
          
          console.error('API error:', errorMessage);
          console.error('Full error response:', result);
          throw new Error(errorMessage);
        }
      } catch (error: any) {
        clearInterval(timerInterval);
        // Handle timeout or network errors
        if (error.name === 'AbortError') {
          throw new Error('Request timed out. The face detection is taking too long. Please try again.');
        } else {
          throw error;
        }
      }
    } catch (error: any) {
      clearInterval(timerInterval);
      console.error('Error finding photos:', error);
      
      // More specific error messages
      let errorMessage = 'Unknown error occurred';
      if (error.message) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      Alert.alert(
        'Error', 
        `Failed to find your photos: ${errorMessage}`,
        [
          { text: 'OK', style: 'default' },
          { text: 'Try Again', onPress: findMyPhotos, style: 'default' }
        ]
      );
    } finally {
      clearInterval(timerInterval);
      setLoading(false);
      setLoadingMessage("Searching for your face in all room photos...");
    }
  };

  if (!visible) return null;
  
  if (hasPermission === null) {
    return (
      <Modal
        visible={visible}
        transparent={true}
        animationType="slide"
        onRequestClose={onClose}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <ActivityIndicator size="large" color="#0070f3" />
            <Text style={styles.loadingText}>Requesting camera permission...</Text>
          </View>
        </View>
      </Modal>
    );
  }
  
  if (hasPermission === false) {
    return (
      <Modal
        visible={visible}
        transparent={true}
        animationType="slide"
        onRequestClose={onClose}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.errorText}>Camera permission is required.</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>Find My Photos</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeIcon}>
              <Ionicons name="close" size={24} color="#000" />
            </TouchableOpacity>
          </View>
          
          {!capturedImage ? (
            <View style={styles.cameraContainer}>
              <Text style={styles.instructions}>
                Position your face within the oval and take a photo
              </Text>
              <View style={styles.ovalMask}>
                <CameraView
                  ref={cameraRef}
                  style={styles.camera}
                  facing="front"
                >
                  <View style={styles.ovalOverlay} />
                </CameraView>
              </View>
              
              <TouchableOpacity 
                style={styles.captureButton} 
                onPress={takePicture}
              >
                <Ionicons name="camera" size={32} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.previewContainer}>
              <Text style={styles.previewText}>Confirm your photo</Text>
              <View style={styles.ovalMask}>
                <Image source={{ uri: capturedImage }} style={styles.previewImage} />
                <View style={styles.ovalOverlay} />
              </View>
              
              <View style={styles.previewButtons}>
                <TouchableOpacity 
                  style={[styles.previewButton, styles.retakeButton]} 
                  onPress={resetCapture}
                  disabled={loading}
                >
                  <Text style={[styles.buttonText, { color: '#333' }]}>Retake</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={[styles.previewButton, styles.useButton, loading && styles.disabledButton]} 
                  onPress={findMyPhotos}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>Find My Photos</Text>
                  )}
                </TouchableOpacity>
              </View>
              
              {loading && (
                <View style={styles.loadingContainer}>
                  <Text style={styles.loadingText}>
                    {loadingMessage}
                  </Text>
                  <Text style={styles.loadingSubtext}>
                    Analyzing {roomImages.length} photos...
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '90%',
    height: '80%',
    overflow: 'hidden',
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    flex: 1,
  },
  closeIcon: {
    position: 'absolute',
    right: 0,
    top: 0,
    padding: 4,
  },
  cameraContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
  },
  instructions: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    color: '#555',
  },
  ovalMask: {
    width: 250,
    height: 320,
    borderRadius: 125,
    overflow: 'hidden',
    position: 'relative',
  },
  camera: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  ovalOverlay: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderWidth: 3,
    borderColor: '#0070f3',
    borderRadius: 125,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  captureButton: {
    backgroundColor: '#0070f3',
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 30,
  },
  previewContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
  },
  previewText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    color: '#555',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginTop: 30,
  },
  previewButton: {
    padding: 12,
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
  },
  retakeButton: {
    backgroundColor: '#f2f2f2',
  },
  useButton: {
    backgroundColor: '#0070f3',
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    fontWeight: 'bold',
    color: '#fff',
  },
  loadingContainer: {
    alignItems: 'center',
    marginTop: 10,
  },
  loadingText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 10,
  },
  loadingSubtext: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 5,
  },
  errorText: {
    fontSize: 16,
    color: '#ff3b30',
    textAlign: 'center',
    marginBottom: 20,
  },
  closeButton: {
    backgroundColor: '#0070f3',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    width: 120,
  },
  closeButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});

export default FaceCapture;