'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import axios from 'axios'
import { jwtDecode } from 'jwt-decode'
import { toast } from 'sonner'

interface User {
  id: string
  name: string
  email: string
  role: 'user' | 'admin'
  isEmailVerified: boolean
  method?: 'local' | 'google' | 'facebook'
}

interface AuthContextType {
  user: User | null
  loading: boolean
  loginWithOAuth: (provider: 'google' | 'facebook', isAdmin?: boolean) => void
  login: (email: string, password: string, isAdmin?: boolean) => Promise<void>
  register: (username: string, email: string, password: string, isAdmin?: boolean) => Promise<void>
  logout: () => Promise<void>
  verifyEmail: (email: string, otp: string) => Promise<void>
  resendOTP: (email: string) => Promise<any>
}

const AuthContext = createContext<AuthContextType | null>(null)

function getTokenFromCookie() {
  const cookies = document.cookie.split(';')
  const tokenCookie = cookies.find(cookie => cookie.trim().startsWith('token='))
  return tokenCookie ? tokenCookie.split('=')[1] : null
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkUser()
  }, [])

  const checkUser = async () => {
    try {
      const token = getTokenFromCookie()
      if (!token) {
        setLoading(false)
        return
      }

      // Decode token to get user info
      const decoded = jwtDecode(token) as any
      if (decoded) {
        // Get the current user data from the API
        const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/auth/user`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        })

        if (response.data.success) {
          const userData = response.data.data
          setUser({
            id: userData.id || decoded.id,
            email: userData.email || decoded.email,
            role: userData.role || decoded.role,
            name: userData.name || decoded.email,
            isEmailVerified: userData.isEmailVerified || decoded.isEmailVerified || decoded.method === 'google' || decoded.method === 'facebook',
            method: userData.method || decoded.method
          })
        }
      }

      // Set authorization header for future requests
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`

    } catch (error) {
      console.error('Auth check error:', error)
      document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;'
      delete axios.defaults.headers.common['Authorization']
    } finally {
      setLoading(false)
    }
  }

  const login = async (email: string, password: string, isAdmin?: boolean) => {
    try {
      const path = isAdmin ? 'admin/login' : 'login'
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/auth/${path}`, {
        email,
        password
      })

      if (!res.data.success) {
        throw new Error(res.data.message)
      }

      // Store token in cookie
      const token = res.data.token
      document.cookie = `token=${token}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`
      
      // Set authorization header
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`

      // Update user state using the response data
      const userData = res.data.data.user
      setUser({
        id: userData.id,
        email: userData.email,
        role: isAdmin ? 'admin' : userData.role, // Ensure admin role is set
        name: userData.name || userData.email,
        isEmailVerified: userData.isEmailVerified,
        method: 'local'
      })
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Login failed')
    }
  }

  const loginWithOAuth = (provider: 'google' | 'facebook', isAdmin?: boolean) => {
    const path = isAdmin ? `admin/${provider}` : provider
    // Add state parameter to track admin login
    const state = isAdmin ? 'admin' : 'user'
    window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/auth/${path}?state=${state}`
  }

  const register = async (username: string, email: string, password: string, isAdmin?: boolean) => {
    try {
      // Use admin register route if isAdmin is true
      const path = isAdmin ? 'admin/register' : 'register'
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/auth/${path}`, {
        name: username,
        email,
        password
      })

      if (!res.data.success) {
        throw new Error(res.data.message)
      }

      return res.data
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Registration failed')
    }
  }

  const logout = async () => {
    try {      const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/auth/logout`)
      if (res.data.success) {
        setUser(null)
        toast.success('Logged out successfully')
      }
    } catch (error) {
      console.error('Logout error:', error)
      toast.error('Error during logout')
    } finally {
      // Clear auth state regardless of API call result
      document.cookie = 'token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'
      delete axios.defaults.headers.common['Authorization']
      setUser(null)
    }
  };
  
  const verifyEmail = async (email: string, otp: string) => {    
    try {
      // Trim the OTP to remove any whitespace
      const cleanOTP = otp.trim()
      
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/auth/verify-email`, {
        email,
        otp: cleanOTP
      })

      if (!res.data.success) {
        throw new Error(res.data.message)
      }

      // Don't show toast here, let the component handle it
      return res.data
    } catch (error: any) {
      // Handle axios errors specifically
      if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        const message = error.response.data.message || 'Invalid or expired OTP'
        throw new Error(message)
      } else if (error.request) {
        // The request was made but no response was received
        throw new Error('Network error. Please try again.')
      } else {
        // Something happened in setting up the request
        throw new Error('Failed to verify email. Please try again.')
      }
    }
  }
  const resendOTP = async (email: string) => {
    try {
      const res = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/auth/resend-verification`, { email })
      
      if (!res.data.success) {
        throw new Error(res.data.message)
      }

      return res.data
    } catch (error: any) {
      if (error.response) {
        throw new Error(error.response.data.message || 'Failed to resend OTP')
      } else if (error.request) {
        throw new Error('Network error. Please try again.')
      } else {
        throw new Error('Failed to resend OTP. Please try again.')
      }
    }
  }

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      loginWithOAuth,
      login,
      resendOTP,
      register,
      logout,
      verifyEmail
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
