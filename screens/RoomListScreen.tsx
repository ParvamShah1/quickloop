import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
  AppState,
  AppStateStatus,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  Image,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Dimensions
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Room, User, UserRoom, getUserRooms, joinRoom, createRoom, joinAndSaveRoom, cleanupExpiredRooms, getRoomMemberCount } from '../lib/supabase';
import { getUserData, saveCurrentRoom } from '../lib/storage';
import * as Haptics from 'expo-haptics';
import { ActivityItem } from '../screens/ActivityScreen';

const { width, height } = Dimensions.get('window');

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

interface RoomListScreenProps {
  user: User;
  onSelectRoom: (room: Room) => void;
  onCreateRoom: () => void;
  onLogout: () => void;
  onNavigateToTab: (tab: string) => void;
}

const RoomListScreen: React.FC<RoomListScreenProps> = ({
  user,
  onSelectRoom,
  onCreateRoom,
  onLogout,
  onNavigateToTab
}) => {
  const [userRooms, setUserRooms] = useState<UserRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [joinModalVisible, setJoinModalVisible] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [error, setError] = useState('');
  const [roomDuration, setRoomDuration] = useState(60);
  const [durationUnit, setDurationUnit] = useState('minutes');
  const [activeTab, setActiveTab] = useState('rooms'); // 'rooms', 'join', 'create'
  const [roomMembers, setRoomMembers] = useState<{[key: string]: number}>({});
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  
  useEffect(() => {
    loadUserRooms();
    loadActivities();
    
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    cleanupExpiredRooms().then(success => {
      if (success) console.log('Successfully cleaned up expired rooms on startup');
    });
    
    const cleanupInterval = setInterval(() => {
      cleanupExpiredRooms().then(success => {
        if (success) loadUserRooms();
      });
    }, 15 * 60 * 1000);
    
    return () => {
      subscription.remove();
      clearInterval(cleanupInterval);
    };
  }, []);
  
  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (nextAppState === 'active') {
      console.log('App is active, refreshing room list');
      loadUserRooms();
      loadActivities();
    }
  };

  const loadUserRooms = async () => {
    if (!user.id) {
      Alert.alert('Error', 'User ID not found. Please restart the app.');
      return;
    }

    setLoading(true);
    try {
      const rooms = await getUserRooms(user.id);
      setUserRooms(rooms);
      
      // Fetch member counts for each room
      const memberCounts: {[key: string]: number} = {};
      for (const userRoom of rooms) {
        if (userRoom.room) {
          try {
            // Use the actual API call to get member count
            const count = await getRoomMemberCount(userRoom.room.id);
            memberCounts[userRoom.room.id] = count;
          } catch (error) {
            console.error(`Error getting member count for room ${userRoom.room.id}:`, error);
            memberCounts[userRoom.room.id] = 0;
          }
        }
      }
      setRoomMembers(memberCounts);
    } catch (error) {
      console.error('Error loading rooms:', error);
      Alert.alert('Error', 'Failed to load your rooms. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Load activity data
  const loadActivities = async () => {
    // In a real app, this would fetch from an API
    // For now, we'll use mock data
    const mockActivities: ActivityItem[] = [
      {
        id: '1',
        type: 'join',
        username: 'Liam',
        timestamp: new Date().toISOString(),
        timeDisplay: '10:30 AM',
      },
      {
        id: '2',
        type: 'upload',
        username: 'Sophia',
        timestamp: new Date().toISOString(),
        timeDisplay: '11:15 AM',
        photoCount: 3,
      },
      {
        id: '3',
        type: 'join',
        username: 'Ethan',
        timestamp: new Date().toISOString(),
        timeDisplay: '12:00 PM',
      },
      {
        id: '4',
        type: 'upload',
        username: 'Olivia',
        timestamp: new Date().toISOString(),
        timeDisplay: '12:45 PM',
        photoCount: 2,
      },
      {
        id: '5',
        type: 'create',
        username: 'Noah',
        timestamp: new Date(Date.now() - 86400000).toISOString(), // Yesterday
        timeDisplay: '9:00 AM',
      },
      {
        id: '6',
        type: 'join',
        username: 'Ava',
        timestamp: new Date(Date.now() - 86400000).toISOString(), // Yesterday
        timeDisplay: '9:30 AM',
      },
      {
        id: '7',
        type: 'upload',
        username: 'Lucas',
        timestamp: new Date(Date.now() - 86400000).toISOString(), // Yesterday
        timeDisplay: '10:00 AM',
        photoCount: 5,
      },
      {
        id: '8',
        type: 'join',
        username: 'Isabella',
        timestamp: new Date(Date.now() - 86400000).toISOString(), // Yesterday
        timeDisplay: '11:00 AM',
      },
    ];
    
    setActivities(mockActivities);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadUserRooms();
    loadActivities();
  };

  const handleSelectRoom = (room: Room) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    if (room.expiry_time) {
      const expiryDate = new Date(room.expiry_time);
      const now = new Date();
      
      if (!isNaN(expiryDate.getTime()) && expiryDate <= now) {
        Alert.alert('Room Expired', 'This room has expired and is no longer accessible.');
        loadUserRooms();
        return;
      }
    }
    
    saveCurrentRoom(room)
      .then(() => onSelectRoom(room))
      .catch(error => {
        console.error('Error saving current room:', error);
        onSelectRoom(room);
      });
  };

  const handleJoinRoom = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    if (!roomCode.trim()) {
      Alert.alert('Error', 'Please enter a room code.');
      return;
    }

    const formattedCode = roomCode.trim().toUpperCase();
    setLoading(true);
    
    try {
      const joinSuccess = await joinRoom(formattedCode);
      
      if (!joinSuccess) {
        Alert.alert('Error', 'Room not found or inactive. Please check the code and try again.');
        return;
      }

      if (user.id) await joinAndSaveRoom(user.id, formattedCode);
      await loadUserRooms();
      
      setJoinModalVisible(false);
      setRoomCode('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Success', `Successfully joined room: ${formattedCode}`);
    } catch (error) {
      console.error('Error joining room:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', 'Failed to join the room. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRoom = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    if (!newRoomName.trim()) {
      setError('Please enter a room name');
      return;
    }

    setError('');
    setCreatingRoom(true);

    try {
      const room = await createRoom(newRoomName.trim(), user.username, roomDuration, durationUnit);
      
      if (room) {
        if (user.id) await joinAndSaveRoom(user.id, room.id);
        
        setCreateModalVisible(false);
        setNewRoomName('');
        setRoomDuration(60);
        setDurationUnit('minutes');
        
        setTimeout(async () => await loadUserRooms(), 500);
        
        const expiryDate = new Date(room.expiry_time || '');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          'Room Created',
          `Your room "${room.name}" has been created with code: ${room.id}\n\nExpires: ${expiryDate.toLocaleString()}.`,
          [{ text: 'OK', onPress: () => handleSelectRoom(room) }]
        );
      }
    } catch (err) {
      console.error('Error creating room:', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError('Something went wrong. Please try again.');
    } finally {
      setCreatingRoom(false);
    }
  };

  // Filter active and expired rooms
  const activeRooms = userRooms.filter(userRoom => {
    if (!userRoom.room?.expiry_time) return true;
    const expiryDate = new Date(userRoom.room.expiry_time);
    const now = new Date();
    return expiryDate > now;
  });

  const expiredRooms = userRooms.filter(userRoom => {
    if (!userRoom.room?.expiry_time) return false;
    const expiryDate = new Date(userRoom.room.expiry_time);
    const now = new Date();
    return expiryDate <= now;
  });

  const formatExpiryTime = (expiryTimeStr: string | undefined) => {
    if (!expiryTimeStr) return "No expiry";
    
    const expiryDate = new Date(expiryTimeStr);
    const now = new Date();
    const diffMs = expiryDate.getTime() - now.getTime();
    
    if (isNaN(expiryDate.getTime())) return "Invalid date";
    
    if (diffMs <= 0) return "Expired";
    
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) {
      const remainingHours = diffHours % 24;
      return `Expires in ${diffDays}d ${remainingHours}h`;
    } else if (diffHours > 0) {
      const remainingMinutes = diffMinutes % 60;
      return `Expires in ${diffHours}h ${remainingMinutes}m`;
    } else {
      return `Expires in ${diffMinutes}m`;
    }
  };

  const renderRoomItem = (room: Room, isExpired: boolean = false) => {
    const expiryInfo = isExpired ? "Expired" : formatExpiryTime(room.expiry_time);
    const memberCount = roomMembers[room.id] || 0;
    
    // Placeholder image URLs - in a real app, you would use actual room images
    const placeholderImages = [
      'https://via.placeholder.com/150/FF6B6B/FFFFFF?text=Loop',
      'https://via.placeholder.com/150/E74C3C/FFFFFF?text=Share',
      'https://via.placeholder.com/150/FADBD8/000000?text=Quick',
      'https://via.placeholder.com/150/2ECC71/FFFFFF?text=Connect'
    ];
    
    // Use a random placeholder image based on room name
    const imageIndex = room.name.length % placeholderImages.length;
    
    return (
      <TouchableOpacity
        style={[styles.roomCard, isExpired ? styles.expiredRoomCard : null]}
        onPress={() => handleSelectRoom(room)}
        key={room.id}
        activeOpacity={0.7}
      >
        <LinearGradient
          colors={isExpired ? ['#F5F5F5', '#E0E0E0'] : ['#FFFFFF', '#F9F9F9']}
          style={styles.cardGradient}
        >
          <View style={styles.roomInfo}>
            <Text style={[styles.expiryInfo, isExpired ? styles.expiredText : null]}>{expiryInfo}</Text>
            <Text style={styles.roomName}>{room.name}</Text>
            <View style={styles.memberCountContainer}>
              <Ionicons name="people" size={16} color={COLORS.primary} />
              <Text style={styles.memberCount}>{memberCount} members</Text>
            </View>
          </View>
          <Image
            source={{ uri: placeholderImages[imageIndex] }}
            style={styles.roomImage}
            resizeMode="cover"
          />
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  const handleTabChange = (tab: string) => {
    Haptics.selectionAsync();
    setActiveTab(tab);
  };

  const handleLogout = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: onLogout }
      ]
    );
  };

  const handleNotificationsPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onNavigateToTab('notifications');
  };

  const renderJoinRoomContent = () => (
    <View style={styles.tabContent}>
      <Text style={styles.tabTitle}>Join a Loop</Text>
      <Text style={styles.tabDescription}>Enter a room code to join an existing loop</Text>
      
      <View style={styles.inputContainer}>
        <LinearGradient
          colors={['#FFFFFF', '#F9F9F9']}
          style={styles.inputGradient}
        >
          <TextInput
            style={styles.input}
            placeholder="Enter room code"
            value={roomCode}
            onChangeText={setRoomCode}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholderTextColor={COLORS.gray}
          />
        </LinearGradient>
      </View>
      
      <TouchableOpacity 
        style={[styles.actionButton, !roomCode.trim() && styles.disabledButton]}
        onPress={handleJoinRoom}
        disabled={!roomCode.trim()}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={['#1A2C50', '#2A3F69']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.buttonGradient}
        >
          <Text style={styles.actionButtonText}>Join Room</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  const renderCreateRoomContent = () => (
    <View style={styles.tabContent}>
      <Text style={styles.tabTitle}>Create a New Loop</Text>
      <Text style={styles.tabDescription}>Create a new loop to share with others</Text>
      
      <View style={styles.inputContainer}>
        <LinearGradient
          colors={['#FFFFFF', '#F9F9F9']}
          style={styles.inputGradient}
        >
          <TextInput
            style={styles.input}
            placeholder="Enter room name"
            value={newRoomName}
            onChangeText={setNewRoomName}
            autoCapitalize="words"
            placeholderTextColor={COLORS.gray}
          />
        </LinearGradient>
      </View>
      
      <Text style={styles.inputLabel}>Room Duration</Text>
      <View style={styles.durationContainer}>
        <TouchableOpacity 
          style={[styles.durationOption, roomDuration === 60 && styles.selectedDuration]}
          onPress={() => { 
            Haptics.selectionAsync();
            setRoomDuration(60); 
            setDurationUnit('minutes'); 
          }}
        >
          <Text style={[styles.durationText, roomDuration === 60 && styles.selectedDurationText]}>1 hour</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.durationOption, roomDuration === 1440 && styles.selectedDuration]}
          onPress={() => { 
            Haptics.selectionAsync();
            setRoomDuration(1440); 
            setDurationUnit('minutes'); 
          }}
        >
          <Text style={[styles.durationText, roomDuration === 1440 && styles.selectedDurationText]}>24 hours</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.durationOption, roomDuration === 10080 && styles.selectedDuration]}
          onPress={() => { 
            Haptics.selectionAsync();
            setRoomDuration(10080); 
            setDurationUnit('minutes'); 
          }}
        >
          <Text style={[styles.durationText, roomDuration === 10080 && styles.selectedDurationText]}>7 days</Text>
        </TouchableOpacity>
      </View>
      
      <TouchableOpacity 
        style={[styles.actionButton, (!newRoomName.trim() || creatingRoom) && styles.disabledButton]}
        onPress={handleCreateRoom}
        disabled={!newRoomName.trim() || creatingRoom}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={['#1A2C50', '#2A3F69']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.buttonGradient}
        >
          {creatingRoom ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <Text style={styles.actionButtonText}>Create Room</Text>
          )}
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  const renderRoomsContent = () => (
    <ScrollView 
      style={styles.scrollView}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />
      }
    >
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <>
          <Text style={styles.sectionTitle}>Active Loops</Text>
          {activeRooms.length === 0 ? (
            <Text style={styles.emptyText}>No active rooms found</Text>
          ) : (
            activeRooms.map(userRoom => 
              userRoom.room && renderRoomItem(userRoom.room)
            )
          )}
          
          <Text style={styles.sectionTitle}>Past Loops</Text>
          {expiredRooms.length === 0 ? (
            <Text style={styles.emptyText}>No expired rooms found</Text>
          ) : (
            expiredRooms.map(userRoom => 
              userRoom.room && renderRoomItem(userRoom.room, true)
            )
          )}
        </>
      )}
    </ScrollView>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'join':
        return renderJoinRoomContent();
      case 'create':
        return renderCreateRoomContent();
      case 'rooms':
      default:
        return renderRoomsContent();
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      
      {/* Header with gradient and curved bottom edge */}
      <LinearGradient
        colors={['#1A2C50', '#2A3F69']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerBackground}
      >
        <SafeAreaView style={{ backgroundColor: 'transparent' }}>
          <View style={styles.headerContent}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerTitle}>QuickLoop</Text>
              <Text style={styles.headerSubtitle}>Welcome, {user.username}</Text>
            </View>
            <View style={styles.headerRight}>
              <TouchableOpacity 
                style={styles.headerButton} 
                onPress={handleNotificationsPress}
              >
                <Ionicons name="notifications" size={24} color={COLORS.white} />
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.headerButton} 
                onPress={() => onNavigateToTab('profile')}
              >
                <Ionicons name="person" size={24} color={COLORS.white} />
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
        <View style={styles.curveContainer}>
          <View style={styles.curve} />
        </View>
      </LinearGradient>
      
      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'rooms' && styles.activeTab]} 
          onPress={() => handleTabChange('rooms')}
        >
          <Text style={[styles.tabText, activeTab === 'rooms' && styles.activeTabText]}>Loops</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'join' && styles.activeTab]} 
          onPress={() => handleTabChange('join')}
        >
          <Text style={[styles.tabText, activeTab === 'join' && styles.activeTabText]}>Join Loop</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'create' && styles.activeTab]} 
          onPress={() => handleTabChange('create')}
        >
          <Text style={[styles.tabText, activeTab === 'create' && styles.activeTabText]}>Create Loop</Text>
        </TouchableOpacity>
      </View>
      
      {/* Tab Content */}
      <SafeAreaView style={styles.contentContainer}>
        {renderTabContent()}
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  headerBackground: {
    width: '100%',
    paddingTop: Platform.OS === 'ios' ? 0 : StatusBar.currentHeight || 0,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  curveContainer: {
    height: 40,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  curve: {
    backgroundColor: COLORS.white,
    height: 80,
    width: '100%',
    position: 'absolute',
    bottom: -40,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
  },
  headerLeft: {
    flexDirection: 'column',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.white,
    textShadowColor: 'rgba(0,0,0,0.1)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  headerSubtitle: {
    fontSize: 16,
    color: COLORS.white,
    marginTop: 2,
    opacity: 0.9,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerButton: {
    padding: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginLeft: 10,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    paddingHorizontal: 10,
    marginTop: 10,
    marginBottom: 5,
  },
  tab: {
    flex: 1,
    paddingVertical: 15,
    alignItems: 'center',
    marginHorizontal: 5,
    borderRadius: 10,
  },
  activeTab: {
    backgroundColor: COLORS.lightBg,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.accent,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  tabText: {
    color: COLORS.gray,
    fontSize: 16,
  },
  activeTabText: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
    padding: 20,
    backgroundColor: COLORS.white,
  },
  tabContent: {
    flex: 1,
    padding: 20,
    backgroundColor: COLORS.white,
  },
  tabTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    color: COLORS.primary,
  },
  tabDescription: {
    fontSize: 16,
    color: COLORS.gray,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 15,
    color: COLORS.primary,
  },
  roomCard: {
    marginBottom: 20,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  cardGradient: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 16,
    overflow: 'hidden',
    padding: 16,
  },
  expiredRoomCard: {
    opacity: 0.7,
  },
  roomInfo: {
    flex: 1,
    justifyContent: 'center',
    marginRight: 10,
  },
  expiryInfo: {
    fontSize: 14,
    color: COLORS.accent,
    marginBottom: 5,
    fontWeight: '500',
  },
  expiredText: {
    color: COLORS.gray,
  },
  roomName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    color: COLORS.primary,
  },
  memberCountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberCount: {
    fontSize: 14,
    color: COLORS.gray,
    marginLeft: 5,
  },
  roomImage: {
    width: 120,
    height: 80,
    borderRadius: 12,
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.gray,
    fontStyle: 'italic',
    marginBottom: 20,
    textAlign: 'center',
    paddingVertical: 20,
  },
  inputContainer: {
    marginBottom: 20,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  inputGradient: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
  },
  input: {
    padding: 16,
    fontSize: 16,
    color: COLORS.primary,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 10,
    color: COLORS.primary,
  },
  durationContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  durationOption: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    alignItems: 'center',
    marginHorizontal: 5,
    backgroundColor: COLORS.white,
  },
  selectedDuration: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.lightBg,
  },
  durationText: {
    fontSize: 14,
    color: COLORS.gray,
  },
  selectedDurationText: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  actionButton: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonGradient: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  actionButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.5,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  contentContainer: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
});

export default RoomListScreen;