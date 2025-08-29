import React from 'react';
import { registerRootComponent } from 'expo';
import App from './App';

// Keeps native/Expo Go happy
registerRootComponent(App);

// Satisfies the web/runtime that expects a default export from index.js
export default App;
