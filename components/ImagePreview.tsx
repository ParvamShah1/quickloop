import React, { useState, useRef, useEffect, memo, useCallback, useMemo } from 'react';
import {
  View,
  Image,
  StyleSheet,
  Dimensions,
  Modal,
  TouchableOpacity,
  Text,
  StatusBar,
  SafeAreaView,
  FlatList,
  Alert,
  Platform,
  ToastAndroid,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RoomImage } from '../lib/supabase';
import { downloadImage } from '../lib/imageUtils';

// Memoized image item component for better performance
const ImageItem = memo(({ item }: { item: RoomImage }) => {
  return (
    <View style={styles.imageContainer}>
      <Image
        source={{ uri: item.image_url }}
        style={styles.previewImage}
        resizeMode="contain"
        fadeDuration={100}
        progressiveRenderingEnabled={true}
      />
    </View>
  );
});

interface ImagePreviewProps {
  visible: boolean;
  images: RoomImage[];
  initialIndex: number;
  onClose: () => void;
}

const { width, height } = Dimensions.get('window');

const ImagePreview: React.FC<ImagePreviewProps> = ({
  visible,
  images,
  initialIndex,
  onClose,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [downloading, setDownloading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Reset current index when initialIndex changes
  useEffect(() => {
    if (visible) {
      setCurrentIndex(initialIndex);
    }
  }, [initialIndex, visible]);

  // Handle image download
  const handleDownload = useCallback(async () => {
    if (currentIndex < 0 || currentIndex >= images.length) return;
    
    try {
      setDownloading(true);
      const imageUrl = images[currentIndex].image_url;
      
      const result = await downloadImage(imageUrl);
      
      setDownloading(false);
      
      if (result.success) {
        // Show success message with toast instead of alert
        if (Platform.OS === 'android') {
          // On Android, we can use ToastAndroid
          ToastAndroid.show('Image saved to your device', ToastAndroid.SHORT);
        } else {
          // On iOS, we'll keep the alert for now
          Alert.alert('Success', 'Image saved to your device');
        }
      } else if (result.permissionDenied) {
        Alert.alert('Permission Denied', 'Unable to save image. Please grant storage permission in settings.');
      } else {
        Alert.alert('Error', 'Failed to save image');
      }
    } catch (error) {
      setDownloading(false);
      console.error('Error downloading image:', error);
      Alert.alert('Error', 'Failed to save image');
    }
  }, [currentIndex, images]);

  // Use memoized callbacks for better performance
  const handleViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    if (viewableItems && viewableItems.length > 0) {
      const visibleIndex = viewableItems[0].index;
      setCurrentIndex(visibleIndex);
    }
  }, []);

  const goToPrevious = useCallback(() => {
    if (currentIndex > 0 && flatListRef.current) {
      flatListRef.current.scrollToIndex({
        index: currentIndex - 1,
        animated: true,
      });
    }
  }, [currentIndex]);

  const goToNext = useCallback(() => {
    if (currentIndex < images.length - 1 && flatListRef.current) {
      flatListRef.current.scrollToIndex({
        index: currentIndex + 1,
        animated: true,
      });
    }
  }, [currentIndex, images.length]);

  // Memoize the viewability config
  const viewabilityConfig = useMemo(() => ({
    viewAreaCoveragePercentThreshold: 50
  }), []);

  // Memoize getItemLayout
  const getItemLayout = useCallback((_: any, index: number) => ({
    length: width,
    offset: width * index,
    index,
  }), []);

  // Memoize the item renderer function
  const renderItem = useCallback(({ item }: { item: RoomImage }) => (
  <ImageItem item={item} />
), []);

  // Memoize the scroll to index failed handler
  const handleScrollToIndexFailed = useCallback((info: any) => {
    console.log('Scroll to index failed:', info);
    setTimeout(() => {
      if (flatListRef.current) {
        flatListRef.current.scrollToOffset({
          offset: info.index * width,
          animated: false,
        });
      }
    }, 50);
  }, []);

  useEffect(() => {
    if (visible && flatListRef.current) {
      try {
        setTimeout(() => {
          if (flatListRef.current) {
            flatListRef.current.scrollToIndex({
              index: initialIndex,
              animated: false,
            });
          }
        }, 10);
      } catch (error) {
        console.log("Error scrolling to index:", error);
      }
    }
  }, [visible, initialIndex]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
      <StatusBar barStyle="light-content" backgroundColor="#000000" />
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.imageCounter}>
            {currentIndex + 1} / {images.length}
          </Text>
          <TouchableOpacity style={styles.infoButton}>
            <Text style={styles.uploaderText}>
              {images[currentIndex]?.uploaded_by || 'Unknown'}
            </Text>
          </TouchableOpacity>
        </View>

        <FlatList
          ref={flatListRef}
          data={images}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
            renderItem={renderItem}
          keyExtractor={(item) => item.id || Math.random().toString()}
          onViewableItemsChanged={handleViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            getItemLayout={getItemLayout}
            initialNumToRender={3}
            maxToRenderPerBatch={2}
            windowSize={5}
            removeClippedSubviews={false}
            initialScrollIndex={initialIndex}
            decelerationRate="fast"
            disableIntervalMomentum
            snapToAlignment="center"
            snapToInterval={width}
            onScrollToIndexFailed={handleScrollToIndexFailed}
        />

        <View style={styles.footer}>
          {currentIndex > 0 && (
            <TouchableOpacity
              style={styles.navButton}
                onPress={goToPrevious}
            >
              <Ionicons name="chevron-back" size={28} color="#fff" />
            </TouchableOpacity>
          )}
          
          {/* Download button */}
          <TouchableOpacity
            style={styles.downloadButton}
            onPress={handleDownload}
            disabled={downloading}
          >
            <Ionicons 
              name={downloading ? "cloud-download" : "cloud-download-outline"} 
              size={28} 
              color="#fff" 
            />
          </TouchableOpacity>
          
          {currentIndex < images.length - 1 && (
            <TouchableOpacity
              style={[styles.navButton, styles.rightNavButton]}
                onPress={goToNext}
            >
              <Ionicons name="chevron-forward" size={28} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    zIndex: 10,
  },
  closeButton: {
    padding: 8,
  },
  imageCounter: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Poppins-Medium',
  },
  infoButton: {
    padding: 8,
  },
  uploaderText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Poppins-Medium',
  },
  imageContainer: {
    width,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImage: {
    width: width,
    height: height - 200,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
  },
  navButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rightNavButton: {
    alignSelf: 'flex-end',
  },
  downloadButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
  },
});

export default ImagePreview; 