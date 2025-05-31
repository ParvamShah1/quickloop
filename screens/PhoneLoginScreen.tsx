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
  Alert
} from 'react-native';
import Input from '../components/Input';
import Button from '../components/Button';
import OTPInput from '../components/OTPInput';
import { sendOTP, verifyOTP } from '../lib/otpService';
import { checkPhoneNumberExists, createUser } from '../lib/supabase';
import { saveUserData } from '../lib/storage';

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
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.inner}>
            <View style={styles.logoContainer}>
              <Text style={styles.logoText}>QuickLoop</Text>
              <Text style={styles.tagline}>Snap.Share.Gone.</Text>
            </View>
            
            <View style={styles.formContainer}>
              {renderStep()}
            </View>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  keyboardAvoid: {
    flex: 1,
  },
  inner: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#0070f3',
  },
  tagline: {
    fontSize: 16,
    color: '#666',
    marginTop: 8,
  },
  formContainer: {
    width: '100%',
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