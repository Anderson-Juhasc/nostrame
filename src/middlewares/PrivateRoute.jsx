import React from 'react';
import { Route, Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

const PrivateRoute = ({ Component }) => {
  const { isAuthenticated } = useAuth();

  return isAuthenticated ? <Component /> : <Navigate to="/" />;
};

export default PrivateRoute;
