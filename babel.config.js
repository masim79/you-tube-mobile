// Added for M1 chunk 4 (watch screen gestures/mini-player): react-native-reanimated
// 4.x moved its worklet transform to `react-native-worklets/plugin`, which only
// runs when a project babel.config.js names it explicitly — there was no
// babel.config.js before this (Expo's implicit default config has no way to add
// a plugin). `babel-preset-expo` stays the base preset so TypeScript/JSX and
// every existing screen keep compiling exactly as before.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: ["react-native-worklets/plugin"],
  };
};
