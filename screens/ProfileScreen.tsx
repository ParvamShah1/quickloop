import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  StatusBar,
  Platform,
  ScrollView
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { User } from '../lib/supabase';

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

interface ProfileScreenProps {
  user: User;
  onBack: () => void;
  onLogout: () => void;
  onNavigateToTab: (tab: string) => void;
}

const ProfileScreen: React.FC<ProfileScreenProps> = ({
  user,
  onBack,
  onLogout,
  onNavigateToTab
}) => {
  // Mock data for the profile stats
  const loopsCount = 12;
  const joinedCount = 24;
  
  // Settings menu items
  const settingsItems = [
    { icon: 'notifications-outline', title: 'Notifications' },
    { icon: 'lock-closed-outline', title: 'Privacy' },
    { icon: 'person-outline', title: 'Account' },
    { icon: 'sunny-outline', title: 'Appearance' },
    { icon: 'help-circle-outline', title: 'Help' },
  ];

  const handleLogout = () => {
    onLogout();
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      
      {/* Header */}
      <LinearGradient
        colors={['#1A2C50', '#2A3F69']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <SafeAreaView style={{ backgroundColor: 'transparent' }}>
          <View style={styles.headerContent}>
            <TouchableOpacity style={styles.backButton} onPress={onBack}>
              <Ionicons name="arrow-back" size={24} color={COLORS.white} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Profile</Text>
            <View style={styles.placeholder} />
          </View>
        </SafeAreaView>
      </LinearGradient>
      
      <SafeAreaView style={styles.contentContainer}>
        <ScrollView style={styles.content}>
          {/* Profile Info */}
          <View style={styles.profileInfo}>
            <View style={styles.avatarContainer}>
              {/* This would be replaced with an actual image component */}
              <View style={styles.avatar}>
                {/* Placeholder for profile image */}
              </View>
            </View>
            
            <Text style={styles.userName}>{user.username || "Sophia Clark"}</Text>
            <Text style={styles.userHandle}>@{user.username?.toLowerCase().replace(/\s+/g, '_') || "sophia_c"}</Text>
            
            {/* Stats */}
            <View style={styles.statsContainer}>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>{loopsCount}</Text>
                <Text style={styles.statLabel}>Loops</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>{joinedCount}</Text>
                <Text style={styles.statLabel}>Joined</Text>
              </View>
            </View>
          </View>
          
          {/* Settings */}
          <View style={styles.settingsContainer}>
            <Text style={styles.settingsTitle}>Settings</Text>
            
            {settingsItems.map((item, index) => (
              <TouchableOpacity 
                key={index} 
                style={styles.settingsItem}
                onPress={() => {}}
              >
                <View style={styles.settingsIconContainer}>
                  <Ionicons name={item.icon} size={22} color={COLORS.gray} />
                </View>
                <Text style={styles.settingsItemText}>{item.title}</Text>
                <Ionicons name="chevron-forward" size={20} color={COLORS.gray} />
              </TouchableOpacity>
            ))}
            
            <TouchableOpacity 
              style={[styles.settingsItem, styles.logoutItem]}
              onPress={handleLogout}
            >
              <View style={styles.settingsIconContainer}>
                <Ionicons name="log-out-outline" size={22} color="#EF4444" />
              </View>
              <Text style={styles.logoutText}>Logout</Text>
            </TouchableOpacity>
          </View>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  backButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.3)',
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
  profileInfo: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  avatarContainer: {
    marginBottom: 16,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.lightBg, // Light background color
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  userName: {
    fontSize: 22,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  userHandle: {
    fontSize: 16,
    color: COLORS.gray,
    marginBottom: 24,
  },
  statsContainer: {
    flexDirection: 'row',
    width: '80%',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    backgroundColor: COLORS.white,
  },
  statBox: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.accent,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: COLORS.gray,
  },
  settingsContainer: {
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  settingsTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
    color: COLORS.text,
    marginLeft: 8,
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  settingsIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  settingsItemText: {
    flex: 1,
    fontSize: 16,
    color: COLORS.text,
  },
  logoutItem: {
    marginTop: 20,
    borderBottomWidth: 0,
    backgroundColor: COLORS.white,
  },
  logoutText: {
    flex: 1,
    fontSize: 16,
    color: '#EF4444', // Red color for logout
  },
});

export default ProfileScreen; 