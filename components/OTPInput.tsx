import React, { useState, useRef, useEffect } from 'react';
import { 
  View, 
  TextInput, 
  StyleSheet, 
  Keyboard, 
  Text
} from 'react-native';

interface OTPInputProps {
  length: number;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

const OTPInput: React.FC<OTPInputProps> = ({ 
  length = 6, 
  value = '', 
  onChange,
  error
}) => {
  const [localValue, setLocalValue] = useState<string[]>(
    value.split('').concat(Array(length - value.length).fill(''))
  );
  const inputRefs = useRef<Array<TextInput | null>>([]);

  useEffect(() => {
    // Update local state when value prop changes
    setLocalValue(value.split('').concat(Array(length - value.length).fill('')));
  }, [value, length]);

  const handleChange = (text: string, index: number) => {
    // Only allow numbers
    if (!/^[0-9]?$/.test(text)) return;

    const newValue = [...localValue];
    newValue[index] = text;
    setLocalValue(newValue);

    // Combine digits into a string and pass to parent
    const combinedValue = newValue.join('');
    onChange(combinedValue);

    // Auto-focus next input if a digit was entered
    if (text && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    // Handle backspace
    if (e.nativeEvent.key === 'Backspace' && !localValue[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Enter OTP has been sent to your mobile number</Text>
      <View style={styles.inputContainer}>
        {Array(length).fill(0).map((_, index) => (
          <TextInput
            key={index}
            ref={ref => {
              inputRefs.current[index] = ref;
            }}
            style={[styles.input, error ? styles.inputError : null]}
            value={localValue[index]}
            onChangeText={text => handleChange(text, index)}
            onKeyPress={e => handleKeyPress(e, index)}
            keyboardType="numeric"
            maxLength={1}
            selectTextOnFocus
            selectionColor="#0070f3"
          />
        ))}
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    marginBottom: 16,
    color: '#666',
    textAlign: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  input: {
    width: 45,
    height: 45,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 18,
    backgroundColor: '#f5f5f5',
  },
  inputError: {
    borderColor: '#ff3b30',
  },
  errorText: {
    color: '#ff3b30',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  }
});

export default OTPInput; 