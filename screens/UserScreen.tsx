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
  TouchableOpacity
} from 'react-native';
import Input from '../components/Input';
import Button from '../components/Button';
import { createUser, checkUserExists } from '../lib/supabase';

interface UserScreenProps {
  onUserCreated: (name: string) => void;
  onSwitchToPhoneLogin: () => void;
}

const UserScreen: React.FC<UserScreenProps> = ({ onUserCreated, onSwitchToPhoneLogin }) => {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    // Validate name
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }

    setError('');
    setLoading(true);

    try {
      // First check if the user already exists
      const existingUser = await checkUserExists(name.trim());
      
      if (existingUser) {
        // User exists, simply return the name
        onUserCreated(name.trim());
        return;
      }
      
      // User doesn't exist, create new user
      const user = await createUser(name.trim());
      
      if (user) {
        // Pass the name back to parent component
        onUserCreated(name.trim());
      } else {
        setError('Failed to create user. Please try again.');
      }
    } catch (err) {
      console.error('Error creating user:', err);
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
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
              <Text style={styles.title}>Welcome!</Text>
              <Text style={styles.subtitle}>Please enter your name to continue</Text>
              
              <Input
                label="Your Name"
                placeholder="Enter your name"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                autoCorrect={false}
                error={error}
              />
              
              <Button
                title="Continue"
                onPress={handleSubmit}
                loading={loading}
                disabled={!name.trim()}
              />

              <TouchableOpacity onPress={onSwitchToPhoneLogin} style={styles.phoneLoginButton}>
                <Text style={styles.phoneLoginText}>Login with phone number</Text>
              </TouchableOpacity>
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
    backgroundColor: '#fff',
  },
  keyboardAvoid: {
    flex: 1,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
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
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
    textAlign: 'center',
  },
  phoneLoginButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  phoneLoginText: {
    color: '#0070f3',
    fontSize: 16,
  },
});

export default UserScreen; 