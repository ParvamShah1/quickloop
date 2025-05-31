import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  Modal,
  Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface MatchedPhoto {
  url: string;
  similarity: number;
}

interface MatchedPhotosProps {
  visible: boolean;
  onClose: () => void;
  photos: MatchedPhoto[];
  onImagePress?: (url: string) => void;
}

const MatchedPhotos: React.FC<MatchedPhotosProps> = ({
  visible,
  onClose,
  photos,
  onImagePress
}) => {
  const [selectedImage, setSelectedImage] = React.useState<string | null>(null);

  const handleImagePress = (url: string) => {
    if (onImagePress) {
      onImagePress(url);
    } else {
      setSelectedImage(url);
    }
  };

  const closeImagePreview = () => {
    setSelectedImage(null);
  };

  const renderPhoto = ({ item }: { item: MatchedPhoto }) => {
    // Calculate similarity percentage
    const similarityPercentage = Math.round(item.similarity * 100);
    
    return (
      <TouchableOpacity 
        style={styles.photoContainer}
        onPress={() => handleImagePress(item.url)}
      >
        <Image 
          source={{ uri: item.url }} 
          style={styles.photo}
          resizeMode="cover"
        />
        <View style={styles.similarityBadge}>
          <Text style={styles.similarityText}>{similarityPercentage}% Match</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderImagePreview = () => {
    if (!selectedImage) return null;
    
    return (
      <Modal
        visible={!!selectedImage}
        transparent={true}
        animationType="fade"
        onRequestClose={closeImagePreview}
      >
        <View style={styles.previewContainer}>
          <TouchableOpacity 
            style={styles.previewCloseButton}
            onPress={closeImagePreview}
          >
            <Ionicons name="close-circle" size={36} color="#fff" />
          </TouchableOpacity>
          
          <Image
            source={{ uri: selectedImage }}
            style={styles.previewImage}
            resizeMode="contain"
          />
        </View>
      </Modal>
    );
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Your Photos</Text>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={24} color="#000" />
          </TouchableOpacity>
        </View>

        {photos.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="images-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No matching photos found</Text>
          </View>
        ) : (
          <>
            <Text style={styles.subtitle}>
              Found {photos.length} photo{photos.length !== 1 ? 's' : ''} with your face
            </Text>
            
            <FlatList
              data={photos}
              renderItem={renderPhoto}
              keyExtractor={(item, index) => `${item.url}-${index}`}
              numColumns={2}
              contentContainerStyle={styles.photoList}
            />
          </>
        )}
      </View>
      
      {renderImagePreview()}
    </Modal>
  );
};

const { width } = Dimensions.get('window');
const photoSize = (width - 48) / 2; // 2 columns with padding

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    paddingTop: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  closeButton: {
    position: 'absolute',
    right: 0,
    top: 16,
    padding: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
    textAlign: 'center',
  },
  photoList: {
    paddingBottom: 24,
  },
  photoContainer: {
    width: photoSize,
    height: photoSize,
    margin: 8,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
    position: 'relative',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  similarityBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0, 112, 243, 0.8)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  similarityText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    marginTop: 16,
  },
  previewContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImage: {
    width: '100%',
    height: '80%',
  },
  previewCloseButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    zIndex: 10,
  },
});

export default MatchedPhotos; 