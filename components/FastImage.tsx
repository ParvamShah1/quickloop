import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Image } from 'react-native';
import { getCachedImageUri } from '../lib/imageUtils';

// We'll keep this import for its type definitions, but won't use the actual component
import OriginalFastImage from 'react-native-fast-image';

interface FastImageProps {
  source: { uri: string } | number;
  style?: any;
  resizeMode?: 'contain' | 'cover' | 'stretch' | 'center';
  onLoad?: () => void;
  onError?: () => void;
  onLoadStart?: () => void;
  onLoadEnd?: () => void;
  tintColor?: string;
  fallback?: boolean;
  priority?: 'low' | 'normal' | 'high';
}

// Define extended interface with static properties
interface FastImageStatic extends React.FC<FastImageProps> {
  resizeMode: {
    contain: string;
    cover: string;
    stretch: string;
    center: string;
  };
  priority: {
    low: string;
    normal: string;
    high: string;
  };
  cacheControl: {
    immutable: string;
    web: string;
    cacheOnly: string;
  };
  preload: (sources: Array<{ uri: string }>) => Promise<void>;
}

const FastImageComponent: React.FC<FastImageProps> = ({
  source,
  style,
  resizeMode = 'cover',
  onLoad,
  onError,
  onLoadStart,
  onLoadEnd,
  tintColor,
  fallback = true,
  priority = 'normal',
  ...props
}) => {
  const [imageSource, setImageSource] = useState<any>(source);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const setupImageSource = async () => {
      // Only process URI sources, not require() sources
      if (typeof source !== 'number' && source.uri) {
        try {
          // Get cached URI if available
          const cachedUri = await getCachedImageUri(source.uri);
          
          // Update source with cached URI
          if (cachedUri) {
            console.log(`Using cached image: ${cachedUri.substring(0, 30)}...`);
            setImageSource({ uri: cachedUri });
            // If we're using a cached version, it's likely already loaded
            setLoading(false);
          }
        } catch (err) {
          console.error('Error setting up image source:', err);
          // Fall back to original source
          setImageSource(source);
        }
      } else {
        // For require() sources, use as is
        setImageSource(source);
      }
    };

    setupImageSource();
  }, [source]);

  const handleLoadStart = () => {
    setLoading(true);
    setError(false);
    if (onLoadStart) onLoadStart();
  };

  const handleLoad = () => {
    setLoading(false);
    if (onLoad) onLoad();
  };

  const handleError = () => {
    setLoading(false);
    setError(true);
    if (onError) onError();
  };

  const handleLoadEnd = () => {
    setLoading(false);
    if (onLoadEnd) onLoadEnd();
  };

  // Always use regular Image component to avoid native module issues
  return (
    <View style={[styles.container, style]}>
      <Image
        source={imageSource}
        style={[styles.image, style]}
        resizeMode={resizeMode}
        onLoadStart={handleLoadStart}
        onLoad={handleLoad}
        onError={handleError}
        onLoadEnd={handleLoadEnd}
        {...props}
      />
      
      {loading && fallback && (
        <View style={[styles.loaderContainer, style]}>
          <ActivityIndicator size="small" color="#8B5CF6" />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  loaderContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
  },
});

// Cast to our extended interface type
const FastImage = FastImageComponent as FastImageStatic;

// Define static properties that match the original FastImage API
// but will be used just for compatibility with existing code
FastImage.resizeMode = {
  contain: 'contain',
  cover: 'cover',
  stretch: 'stretch',
  center: 'center'
};

FastImage.priority = {
  low: 'low',
  normal: 'normal',
  high: 'high'
};

FastImage.cacheControl = {
  immutable: 'immutable',
  web: 'web',
  cacheOnly: 'cacheOnly'
};

// Provide a mock preload function that does nothing but returns a resolved Promise
FastImage.preload = (sources: Array<{ uri: string }>) => {
  console.log('FastImage preload not available, using standard Image');
  return Promise.resolve();
};

export default FastImage; 