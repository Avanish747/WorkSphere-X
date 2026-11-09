import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import api, { setAccessToken } from '../services/api';

export const initializeSession = createAsyncThunk(
  'auth/initializeSession',
  async (_, { rejectWithValue }) => {
    try {
      const { data } = await api.post('/auth/refresh');
      setAccessToken(data.accessToken);
      const { data: session } = await api.get('/auth/me');
      return { user: session.user, accessToken: data.accessToken, company: session.company };
    } catch {
      setAccessToken(null);
      return rejectWithValue(null);
    }
  },
  {
    condition: (_, { getState }) => {
      const { initialized, status } = getState().auth;
      return !initialized && status !== 'loading';
    },
  },
);

export const loginUser = createAsyncThunk('auth/loginUser', async (credentials, { rejectWithValue }) => {
  try {
    const { data } = await api.post('/auth/login', credentials);
    setAccessToken(data.accessToken);
    return data;
  } catch (error) {
    return rejectWithValue(error.response?.data?.message || 'Unable to sign in.');
  }
});

export const registerCompany = createAsyncThunk('auth/registerCompany', async (payload, { rejectWithValue }) => {
  try {
    const { data } = await api.post('/auth/register-company', payload);
    setAccessToken(data.accessToken);
    return data;
  } catch (error) {
    return rejectWithValue(error.response?.data?.message || 'Unable to create the workspace.');
  }
});

export const logoutUser = createAsyncThunk('auth/logoutUser', async () => {
  try {
    await api.post('/auth/logout');
  } finally {
    setAccessToken(null);
  }
});

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    user: null,
    company: null,
    token: null,
    status: 'idle',
    error: null,
    initialized: false,
  },
  reducers: {
    clearAuthError(state) {
      state.error = null;
    },
  },
  extraReducers(builder) {
    builder
      .addCase(initializeSession.pending, (state) => {
        state.status = 'loading';
      })
      .addCase(initializeSession.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.initialized = true;
        state.user = action.payload.user;
        state.company = action.payload.company;
        state.token = action.payload.accessToken;
      })
      .addCase(initializeSession.rejected, (state) => {
        state.status = 'idle';
        state.initialized = true;
        state.user = null;
        state.company = null;
        state.token = null;
      })
      .addCase(loginUser.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.initialized = true;
        state.user = action.payload.user;
        state.company = action.payload.company;
        state.token = action.payload.accessToken;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      })
      .addCase(registerCompany.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.initialized = true;
        state.user = action.payload.user;
        state.company = action.payload.company;
        state.token = action.payload.accessToken;
      })
      .addCase(registerCompany.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload;
      })
      .addCase(logoutUser.fulfilled, (state) => {
        state.user = null;
        state.company = null;
        state.token = null;
        state.status = 'idle';
        state.initialized = true;
      });
  },
});

export const { clearAuthError } = authSlice.actions;
export default authSlice.reducer;
