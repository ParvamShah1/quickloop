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
  Keyboard
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Room, User, UserRoom, getUserRooms, joinRoom, createRoom, joinAndSaveRoom, cleanupExpiredRooms } from '../lib/supabase';
import { getUserData, saveCurrentRoom } from '../lib/storage';

interface RoomListScreenProps {
  user: User;
  onSelectRoom: (room: Room) => void;
  onCreateRoom: () => void;
  onLogout: () => void;
}

const RoomListScreen: React.FC<RoomListScreenProps> = ({
  user,
  onSelectRoom,
  onCreateRoom,
  onLogout
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
  
  useEffect(() => {
    loadUserRooms();
    
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
    } catch (error) {
      console.error('Error loading rooms:', error);
      Alert.alert('Error', 'Failed to load your rooms. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadUserRooms();
  };

  const handleSelectRoom = (room: Room) => {
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
      Alert.alert('Success', `Successfully joined room: ${formattedCode}`);
    } catch (error) {
      console.error('Error joining room:', error);
      Alert.alert('Error', 'Failed to join the room. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRoom = async () => {
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
        Alert.alert(
          'Room Created',
          `Your room "${room.name}" has been created with code: ${room.id}\n\nExpires: ${expiryDate.toLocaleString()}.`,
          [{ text: 'OK', onPress: () => handleSelectRoom(room) }]
        );
      }
    } catch (err) {
      console.error('Error creating room:', err);
      setError('Something went wrong. Please try again.');
    } finally {
      setCreatingRoom(false);
    }
  };

  const renderRoomItem = ({ item }: { item: UserRoom }) => {
    if (!item.room) return null;
    
    const room = item.room;
    let expiryInfo = "";
    
    if (room.expiry_time) {
      const expiryDate = new Date(room.expiry_time);
      const now = new Date();
      const diffMs = expiryDate.getTime() - now.getTime();
      
      if (!isNaN(expiryDate.getTime())) {
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffHours / 24);
        
        if (diffMs <= 0) {
          expiryInfo = "Expired";
        } else if (diffMinutes < 60) {
          expiryInfo = `Expires in ${diffMinutes}m`;
        } else if (diffHours < 24) {
          const remainingMinutes = diffMinutes % 60;
          expiryInfo = `Expires in ${diffHours}h${remainingMinutes > 0 ? ` ${remainingMinutes}m` : ''}`;
        } else {
          const remainingHours = diffHours % 24;
          expiryInfo = `Expires in ${diffDays}d${remainingHours > 0 ? ` ${remainingHours}h` : ''}`;
        }
      }
    }
    
    return (
      <TouchableOpacity
        style={styles.roomItem}
        onPress={() => handleSelectRoom(room)}
      >
        <View style={styles.roomContent}>
          <Text style={styles.roomName}>{room.name}</Text>
          <View style={styles.roomDetails}>
            <Text style={styles.roomCode}>Code: {room.id}</Text>
            <Text style={styles.roomCreator}>
              {room.created_by === user.username ? 'Your Room' : `By ${room.created_by}`}
            </Text>
          </View>
          {expiryInfo && (
            <View style={[styles.expiryBadge, expiryInfo === "Expired" && styles.expiredBadge]}>
              <Text style={styles.expiryText}>{expiryInfo}</Text>
            </View>
          )}
        </View>
        <Ionicons name="chevron-forward" size={20} color="#64748B" />
      </TouchableOpacity>
    );
  };

  const renderJoinRoomModal = () => (
    <Modal
      visible={joinModalVisible}
      transparent={true}
      animationType="slide"
      onRequestClose={() => setJoinModalVisible(false)}
    >
      <TouchableOpacity 
        style={styles.modalOverlay} 
        activeOpacity={1} 
        onPress={() => setJoinModalVisible(false)}
      >
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Join Room</Text>
          <Text style={styles.modalSubtitle}>Enter 6-digit room code</Text>
          
          <TextInput
            style={styles.input}
            placeholder="ABC123"
            placeholderTextColor="#94A3B8"
            value={roomCode}
            onChangeText={setRoomCode}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
          />
          
          <View style={styles.modalActions}>
            <TouchableOpacity 
              style={[styles.modalButton, styles.cancelButton]}
              onPress={() => setJoinModalVisible(false)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.modalButton, styles.actionButton]}
              onPress={handleJoinRoom}
            >
              <Text style={styles.actionButtonText}>Join Now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );

  const renderCreateRoomModal = () => (
    <Modal
      visible={createModalVisible}
      transparent={true}
      animationType="slide"
      onRequestClose={() => {
        setCreateModalVisible(false);
        setNewRoomName('');
        setRoomDuration(60);
        setDurationUnit('minutes');
        setError('');
      }}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create Room</Text>
            <Text style={styles.modalSubtitle}>Start a new collaboration space</Text>
            
            <TextInput
              style={styles.input}
              placeholder="Room Name"
              placeholderTextColor="#94A3B8"
              value={newRoomName}
              onChangeText={setNewRoomName}
              autoCapitalize="words"
              autoFocus={true}
            />
            
            <Text>Duration</Text>
            <View style={styles.durationContainer}>
              <TouchableOpacity
                style={styles.durationButton}
                onPress={() => {
                  if (durationUnit === 'minutes') {
                    setRoomDuration(Math.max(1, roomDuration - 1));
                  } else {
                    const newDuration = Math.max(1, roomDuration - 1);
                    setRoomDuration(newDuration);
                    if (newDuration === 1) {
                      setDurationUnit('minutes');
                      setRoomDuration(60);
                    }
                  }
                }}
                disabled={roomDuration <= 1}
              >
                <Ionicons name="remove" size={20} color={roomDuration <= 1 ? "#CBD5E1" : "#475569"} />
              </TouchableOpacity>
              
              <View style={styles.durationDisplay}>
                <Text style={styles.durationValue}>{roomDuration}</Text>
                <TouchableOpacity
                  onPress={() => {
                    if (durationUnit === 'minutes' && roomDuration >= 60) {
                      setDurationUnit('hours');
                      setRoomDuration(1);
                    } else if (durationUnit === 'hours' && roomDuration === 1) {
                      setDurationUnit('minutes');
                      setRoomDuration(60);
                    }
                  }}
                >
                  <Text style={styles.durationUnit}>
                    {durationUnit === 'minutes' ? 'minutes' : 'hours'}
                  </Text>
                </TouchableOpacity>
              </View>
              
              <TouchableOpacity
                style={styles.durationButton}
                onPress={() => {
                  if (durationUnit === 'minutes') {
                    const newDuration = Math.min(120, roomDuration + 1);
                    setRoomDuration(newDuration);
                    if (newDuration >= 60) {
                      setDurationUnit('hours');
                      setRoomDuration(1);
                    }
                  } else {
                    setRoomDuration(Math.min(48, roomDuration + 1));
                  }
                }}
                disabled={(durationUnit === 'hours' && roomDuration >= 48)}
              >
                <Ionicons 
                  name="add" 
                  size={20} 
                  color={(durationUnit === 'hours' && roomDuration >= 48) ? "#CBD5E1" : "#475569"} 
                />
              </TouchableOpacity>
            </View>
            
            {error && <Text style={styles.errorText}>{error}</Text>}
            
            <View style={styles.modalActions}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setCreateModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.modalButton, styles.actionButton]}
                onPress={handleCreateRoom}
                disabled={creatingRoom || !newRoomName.trim()}
              >
                {creatingRoom ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.actionButtonText}>Create Room</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Modal>
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#6366F1', '#8B5CF6']}
        style={styles.header}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        <View style={styles.headerContent}>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>QuickLoop</Text>
            <Text style={styles.headerSubtitle}>Welcome, {user.username}</Text>
          </View>
          <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
            <Ionicons name="log-out-outline" size={24} color="white" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6366F1" />
          <Text style={styles.loadingText}>Loading rooms...</Text>
        </View>
      ) : (
        <>
          {userRooms.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={64} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>No Rooms Found</Text>
              <Text style={styles.emptyDescription}>Create or join a room to get started</Text>
            </View>
          ) : (
            <FlatList
              data={userRooms}
              renderItem={renderRoomItem}
              keyExtractor={item => item.id || `${item.user_id}-${item.room_id}`}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={handleRefresh}
                  colors={['#6366F1']}
                />
              }
            />
          )}
        </>
      )}

      <View style={styles.footer}>
        <LinearGradient
          colors={['#3B82F6', '#6366F1']}
          style={styles.footerButton}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <TouchableOpacity
            style={styles.footerButtonContent}
            onPress={() => setJoinModalVisible(true)}
          >
            <Ionicons name="enter-outline" size={20} color="white" />
            <Text style={styles.footerButtonText}>Join Room</Text>
          </TouchableOpacity>
        </LinearGradient>

        <LinearGradient
          colors={['#10B981', '#3B82F6']}
          style={styles.footerButton}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <TouchableOpacity
            style={styles.footerButtonContent}
            onPress={() => setCreateModalVisible(true)}
          >
            <Ionicons name="add-outline" size={20} color="white" />
            <Text style={styles.footerButtonText}>New Room</Text>
          </TouchableOpacity>
        </LinearGradient>
      </View>

      {renderJoinRoomModal()}
      {renderCreateRoomModal()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    paddingTop: 56,
    paddingBottom: 24,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerContent: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: 'Poppins-Bold',
    color: 'white',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 16,
    fontFamily: 'Poppins-Medium',
    color: 'rgba(255,255,255,0.9)',
    marginTop: 8,
  },
  logoutButton: {
    padding: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    fontFamily: 'Poppins-Regular',
    color: '#64748B',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: 'Poppins-SemiBold',
    color: '#1E293B',
    marginTop: 24,
  },
  emptyDescription: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: '#64748B',
    marginTop: 8,
    textAlign: 'center',
  },
  listContent: {
    padding: 16,
  },
  roomItem: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  roomContent: {
    flex: 1,
  },
  roomName: {
    fontSize: 16,
    fontFamily: 'Poppins-SemiBold',
    color: '#1E293B',
    marginBottom: 4,
  },
  roomDetails: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  roomCode: {
    fontSize: 13,
    fontFamily: 'Poppins-Medium',
    color: '#475569',
  },
  roomCreator: {
    fontSize: 12,
    fontFamily: 'Poppins-Regular',
    color: '#64748B',
  },
  expiryBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  expiredBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  expiryText: {
    fontSize: 12,
    fontFamily: 'Poppins-Medium',
    color: '#10B981',
  },
  footer: {
    flexDirection: 'row',
    gap: 16,
    padding: 16,
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 5,
  },
  footerButton: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  footerButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  footerButtonText: {
    color: 'white',
    fontFamily: 'Poppins-SemiBold',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 24,
    padding: 24,
    width: '90%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: 'Poppins-SemiBold',
    color: '#1E293B',
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    fontFamily: 'Poppins-Regular',
    color: '#64748B',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  input: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 16,
    fontFamily: 'Poppins-Regular',
    fontSize: 14,
    color: '#1E293B',
    marginBottom: 24,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 16,
  },
  modalButton: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#F1F5F9',
  },
  cancelButtonText: {
    color: '#64748B',
    fontFamily: 'Poppins-Medium',
    fontSize: 14,
  },
  actionButton: {
    backgroundColor: '#3B82F6',
  },
  actionButtonText: {
    color: 'white',
    fontFamily: 'Poppins-SemiBold',
    fontSize: 14,
  },
  durationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  durationButton: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  durationDisplay: {
    alignItems: 'center',
  },
  durationValue: {
    fontSize: 20,
    fontFamily: 'Poppins-SemiBold',
    color: '#1E293B',
  },
  durationUnit: {
    fontSize: 12,
    fontFamily: 'Poppins-Regular',
    color: '#64748B',
    marginTop: 4,
  },
  errorText: {
    color: '#EF4444',
    fontFamily: 'Poppins-Regular',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 16,
  },
});

export default RoomListScreen;