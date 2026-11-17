---
name: react-native-mobile
description: >-
  Provides architectural patterns for building cross-platform mobile applications using React Native and Expo.
---

# React Native / Expo Mobile Architecture

## 1. Metadata
- **Name:** `react-native-mobile`
- **Origin:** `Astesia Core`
- **Description:** `Provides architectural patterns for building cross-platform mobile applications using React Native and Expo.`

## 2. When to Use
Invoke this skill in the **Engineering Layer** when the project is a mobile application utilizing React Native (specifically with the Expo framework).

## 3. Practical Guidance
1. **Expo Router:** Default to using Expo Router for file-based routing. This provides deep linking out of the box and aligns with modern React paradigms.
2. **Platform Specifics:** Be mindful of iOS vs. Android UI differences. Use `Platform.select()` or platform-specific extensions (`.ios.tsx`, `.android.tsx`) when native behaviors diverge significantly.
3. **Styling:** Use NativeWind (Tailwind for React Native) to ensure consistency with the `design-system.md` tokens, or use `StyleSheet.create` with a centralized theme file. Avoid inline styles.
4. **State & Storage:** Use AsyncStorage or Expo SecureStore for local persistence. Isolate API calls into service functions, do not fetch directly in the view layer.
5. **SafeArea:** Always wrap screens in `<SafeAreaView>` from `react-native-safe-area-context` to prevent UI overlap with notches and home indicators.

## 4. Tested Examples

### ✅ Gold Standard: Expo Router Screen with Safe Area
```tsx
// app/(tabs)/profile.tsx
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../hooks/useAuth';
import Button from '../../components/ui/Button';

export default function ProfileScreen() {
  const { user, logout } = useAuth();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Profile</Text>
        
        {user ? (
          <View style={styles.card}>
            <Text style={styles.email}>{user.email}</Text>
            <Button title="Log Out" onPress={logout} variant="danger" />
          </View>
        ) : (
          <Text>Please log in.</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FAFAFA', // Use theme tokens in real app
  },
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 24,
  },
  card: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  email: {
    fontSize: 16,
    marginBottom: 16,
  }
});
```
