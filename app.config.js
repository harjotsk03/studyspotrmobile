function reversedGoogleIosUrlScheme(clientId) {
  const value = String(clientId || "").trim();
  if (!value) return null;
  if (value.startsWith("com.googleusercontent.apps.")) return value;
  const suffix = ".apps.googleusercontent.com";
  if (value.endsWith(suffix)) {
    return `com.googleusercontent.apps.${value.slice(0, -suffix.length)}`;
  }
  return null;
}

module.exports = ({ config }) => {
  const iosUrlScheme = reversedGoogleIosUrlScheme(
    process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME ||
      process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  );

  const plugins = (config.plugins || []).map((plugin) => {
    if (plugin === "@react-native-google-signin/google-signin" && iosUrlScheme) {
      return ["@react-native-google-signin/google-signin", { iosUrlScheme }];
    }
    return plugin;
  });

  const easProjectId = String(
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID || "",
  ).trim();

  return {
    ...config,
    plugins,
    extra: {
      ...(config.extra || {}),
      eas: {
        ...((config.extra && config.extra.eas) || {}),
        ...(easProjectId ? { projectId: easProjectId } : {}),
      },
    },
  };
};
