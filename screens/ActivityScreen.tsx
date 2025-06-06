import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

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

// Avatar background colors - complementary to the navy theme
const AVATAR_COLORS = [
  '#4A6FA5', // Medium blue
  '#6B98D4', // Light blue
  '#F0B429', // Gold
  '#1A2C50', // Deep navy
  '#3E4C6D', // Slate blue
  '#2D5DA1', // Royal blue
  '#5D7EBB', // Periwinkle
];

export interface ActivityItem {
  id: string;
  type: 'join' | 'upload' | 'create';
  username: string;
  timestamp: string;
  timeDisplay: string;
  photoCount?: number;
  avatarUrl?: string;
}

interface ActivityScreenProps {
  onBack: () => void;
  activities: ActivityItem[];
}

const ActivityScreen: React.FC<ActivityScreenProps> = ({ onBack, activities }) => {
  // Group activities by day
  const groupedActivities: { [key: string]: ActivityItem[] } = {};
  
  activities.forEach(activity => {
    const date = new Date(activity.timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    let groupKey;
    
    if (date.toDateString() === today.toDateString()) {
      groupKey = 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      groupKey = 'Yesterday';
    } else {
      // Format as MM/DD/YYYY for older dates
      groupKey = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
    }
    
    if (!groupedActivities[groupKey]) {
      groupedActivities[groupKey] = [];
    }
    
    groupedActivities[groupKey].push(activity);
  });

  const getActivityText = (activity: ActivityItem) => {
    switch (activity.type) {
      case 'join':
        return `${activity.username} joined the room`;
      case 'upload':
        return `${activity.username} uploaded ${activity.photoCount} photo${activity.photoCount !== 1 ? 's' : ''}`;
      case 'create':
        return `${activity.username} created the room`;
      default:
        return '';
    }
  };

  const getAvatarColor = (name: string) => {
    // Generate a color based on the name
    const charCode = name.charCodeAt(0);
    return AVATAR_COLORS[charCode % AVATAR_COLORS.length];
  };

  const getInitial = (name: string) => {
    return name.charAt(0).toUpperCase();
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      
      {/* Header */}
      <LinearGradient
        colors={[COLORS.primary, COLORS.secondary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.header}
      >
        <SafeAreaView style={{ backgroundColor: 'transparent' }}>
          <View style={styles.headerContent}>
            <TouchableOpacity style={styles.backButton} onPress={onBack}>
              <Ionicons name="arrow-back" size={24} color={COLORS.white} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Activity</Text>
            <View style={styles.placeholder} />
          </View>
        </SafeAreaView>
      </LinearGradient>
      
      <SafeAreaView style={styles.contentContainer}>
        <ScrollView style={styles.content}>
          {Object.keys(groupedActivities).map(date => (
            <View key={date} style={styles.dateGroup}>
              <Text style={styles.dateHeader}>{date}</Text>
              
              {groupedActivities[date].map(activity => (
                <View key={activity.id} style={styles.activityItem}>
                  <View 
                    style={[
                      styles.avatarContainer, 
                      { backgroundColor: getAvatarColor(activity.username) }
                    ]}
                  >
                    <Text style={styles.avatarText}>{getInitial(activity.username)}</Text>
                  </View>
                  <View style={styles.activityContent}>
                    <Text style={styles.activityText}>{getActivityText(activity)}</Text>
                    <Text style={styles.timeText}>{activity.timeDisplay}</Text>
                  </View>
                </View>
              ))}
            </View>
          ))}
          
          {Object.keys(groupedActivities).length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No activity yet</Text>
            </View>
          )}
          
          <View style={styles.bottomPadding} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

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
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  backButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.white,
  },
  placeholder: {
    width: 40,
  },
  contentContainer: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  content: {
    flex: 1,
  },
  dateGroup: {
    marginBottom: 20,
  },
  dateHeader: {
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 16,
    marginTop: 16,
    marginBottom: 12,
    color: COLORS.text,
  },
  activityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 12,
    marginVertical: 4,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  avatarText: {
    color: COLORS.white,
    fontSize: 20,
    fontWeight: 'bold',
  },
  activityContent: {
    flex: 1,
  },
  activityText: {
    fontSize: 16,
    color: COLORS.text,
    marginBottom: 4,
  },
  timeText: {
    fontSize: 14,
    color: COLORS.gray,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.gray,
    textAlign: 'center',
  },
  bottomPadding: {
    height: 40,
  },
});

export default ActivityScreen; 