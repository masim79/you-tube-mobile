import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Text, View } from "react-native";

import { ApiError } from "../../api/http";
import { Button } from "../../ui/Button";
import { Screen } from "../../ui/Screen";
import { TextField } from "../../ui/TextField";
import { useTheme } from "../../theme/ThemeProvider";
import { useAuth } from "../../store/AuthContext";
import { useServer } from "../../store/ServerContext";

export default function LoginScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { baseUrl, clearServer } = useServer();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin() {
    setError(null);
    setSubmitting(true);
    try {
      const result = await login(email, password);
      if (result.twoFactorRequired) {
        setError("This account has two-factor authentication enabled, which the app doesn't support yet. Log in from the web app instead.");
        return;
      }
      router.replace("/(tabs)/home");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not log in");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <View style={{ gap: theme.spacing[4], marginTop: theme.spacing[6] }}>
        <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.xl, fontWeight: "700" }}>Log in</Text>
        {baseUrl ? (
          <Text style={{ color: theme.colors.textSecondary, fontSize: theme.fontSize.xs }}>{baseUrl}</Text>
        ) : null}

        <TextField
          testID="login-email-input"
          label="Email"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          value={email}
          onChangeText={setEmail}
        />
        <TextField
          testID="login-password-input"
          label="Password"
          secureTextEntry
          textContentType="password"
          value={password}
          onChangeText={setPassword}
          errorMessage={error}
        />

        <Button
          testID="login-submit-button"
          label={submitting ? "Logging in…" : "Log in"}
          onPress={handleLogin}
          loading={submitting}
        />
        <Button
          label="Use a different server"
          variant="secondary"
          onPress={async () => {
            await clearServer();
            router.replace("/setup");
          }}
        />
      </View>
    </Screen>
  );
}
