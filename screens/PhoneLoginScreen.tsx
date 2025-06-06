import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  SafeAreaView, 
  KeyboardAvoidingView, 
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  Alert,
  StatusBar
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Input from '../components/Input';
import Button from '../components/Button';
import OTPInput from '../components/OTPInput';
import { sendOTP, verifyOTP } from '../lib/otpService';
import { checkPhoneNumberExists, createUser } from '../lib/supabase';
import { saveUserData } from '../lib/storage';

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

interface PhoneLoginScreenProps {
  onUserCreated: (name: string) => void;
}

const PhoneLoginScreen: React.FC<PhoneLoginScreenProps> = ({ onUserCreated }) => {
  // Step management
  const [currentStep, setCurrentStep] = useState(1); // 1: Name, 2: Phone, 3: OTP

  // Form fields
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  
  // UI states
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleNextFromName = () => {
    // Validate name
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }
    
    setError('');
    setCurrentStep(2); // Move to phone number step
  };

  const handleSendOTP = async () => {
    // Validate phone number
    if (!phoneNumber.trim() || !phoneNumber.match(/^\+[1-9]\d{1,14}$/)) {
      setError('Please enter a valid phone number in international format (e.g., +1234567890)');
      return;
    }

    setError('');
    setLoading(true);

    try {
      // Send OTP
      const result = await sendOTP(phoneNumber.trim());
      
      if (result.success) {
        setCurrentStep(3); // Move to OTP verification step
        Alert.alert('OTP Sent', 'A verification code has been sent to your phone number.');
      } else {
        setError(result.message || 'Failed to send OTP. Please try again.');
      }
    } catch (err) {
      console.error('Error sending OTP:', err);
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    // Validate OTP
    if (!otp.trim() || otp.length !== 6) {
      setError('Please enter the complete 6-digit verification code');
      return;
    }

    setError('');
    setLoading(true);

    try {
      // Verify OTP
      const result = verifyOTP(phoneNumber.trim(), otp.trim());
      
      if (result.success) {
        // Check if user exists with this phone number
        const existingUser = await checkPhoneNumberExists(phoneNumber.trim());
        
        if (existingUser) {
          // User exists, update name if needed and proceed with login
          await saveUserData(existingUser);
          onUserCreated(existingUser.username);
        } else {
          // Create new user with name and phone number
          const user = await createUser(name.trim(), phoneNumber.trim());
          
          if (user) {
            // Save user data and proceed
            await saveUserData(user);
            onUserCreated(user.username);
          } else {
            setError('Failed to create user. Please try again.');
          }
        }
      } else {
        setError(result.message || 'Invalid verification code. Please try again.');
      }
    } catch (err) {
      console.error('Error verifying OTP:', err);
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1: // Name step
        return (
          <>
            <Text style={styles.stepTitle}>What's your name?</Text>
            <Input
              placeholder="Enter your full name"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoCorrect={false}
              error={error}
            />
            <Button
              title="Next"
              onPress={handleNextFromName}
              disabled={!name.trim()}
            />
          </>
        );
      
      case 2: // Phone number step
        return (
          <>
            <Text style={styles.stepTitle}>What's your phone number?</Text>
            <Input
              placeholder="Enter your phone number (e.g., +1234567890)"
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              keyboardType="phone-pad"
              autoCapitalize="none"
              autoCorrect={false}
              error={error}
            />
            <Button
              title="Send Verification Code"
              onPress={handleSendOTP}
              loading={loading}
              disabled={!phoneNumber.trim()}
            />
          </>
        );
      
      case 3: // OTP step
        return (
          <>
            <OTPInput
              length={6}
              value={otp}
              onChange={setOtp}
              error={error}
            />
            <Button
              title="Verify & Continue"
              onPress={handleVerifyOTP}
              loading={loading}
              disabled={!otp.trim() || otp.length !== 6}
            />
            <TouchableWithoutFeedback onPress={handleSendOTP}>
              <Text style={styles.resendText}>Resend verification code</Text>
            </TouchableWithoutFeedback>
          </>
        );
      
      default:
        return null;
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      
      <LinearGradient
        colors={[COLORS.primary, COLORS.secondary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <SafeAreaView style={{ backgroundColor: 'transparent' }}>
          <View style={styles.headerContent}>
            <Text style={styles.logoText}>QuickLoop</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
      
      <SafeAreaView style={styles.contentContainer}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoid}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.inner}>
              <View style={styles.formContainer}>
                {renderStep()}
              </View>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  contentContainer: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  keyboardAvoid: {
    flex: 1,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  formContainer: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  logoText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.white,
    textAlign: 'center',
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 24,
    color: '#333',
  },
  resendText: {
    color: '#0070f3',
    textAlign: 'center',
    marginTop: 16,
    fontSize: 14,
  }
});

export default PhoneLoginScreen; 