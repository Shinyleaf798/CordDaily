import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SignupScreen from './userScreen/signup';
import LoginScreen from './userScreen/login';
import HomeScreen from './userScreen/home';
import RecordScreen from './userScreen/recordDaily';
import SummaryScreen from './userScreen/summary';
import UserScreen from './userScreen/user';
import AboutScreen from './userScreen/about';
import ProfileScreen from './userScreen/profile';
import NoticeScreen from './userScreen/notice';
import AllBillsScreen from './userScreen/allbills';
import ResetPassScreen from './userScreen/reset_password';

import { BillsProvider  } from "./global_function/billsContent";

const Stack = createNativeStackNavigator();

export default function Main() {
  return (
    <BillsProvider>
      <NavigationContainer >
        <Stack.Navigator 
          screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',   
          contentStyle: { backgroundColor: '#000' }, // also prevents flash
        }}
        initialRouteName="Login"
      >
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Signup" component={SignupScreen} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Record" component={RecordScreen} />
          <Stack.Screen name="Summary" component={SummaryScreen} />
          <Stack.Screen name="User" component={UserScreen} />
          <Stack.Screen name="About" component={AboutScreen} />
          <Stack.Screen name="Profile" component={ProfileScreen} />
          <Stack.Screen name="Notice" component={NoticeScreen} />
          <Stack.Screen name="ResetPass" component={ResetPassScreen} />
          <Stack.Screen name="AllBills" component={AllBillsScreen} />

        </Stack.Navigator>
      </NavigationContainer>
    </BillsProvider>
  );
}
