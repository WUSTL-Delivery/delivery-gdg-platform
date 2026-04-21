// app/order/[id]/page.tsx
"use client"
import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

interface OrderItem {
  item_id: number;
  item_name: string;
  quantity: number;
  price: number;
}

interface OrderDetails {
  id: number;
  userId: string;
  vendorId: string;
  vendorName: string;
  items: OrderItem[];
  status: string;
  created_at: string;
  dropOffLocation: string;
  robotId: string | null;
  dropoff_coordinates?: {
    name: string;
    latitude: number;
    longitude: number;
  };
}

export default function OrderTrackingPage() {
  const params = useParams()
  const router = useRouter()
  const orderId = params.id as string

  const [order, setOrder] = useState<OrderDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Fetch order details
  const fetchOrderDetails = async () => {
    try {
      const response = await fetch(`/api/orders/${orderId}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch order details')
      }

      setOrder(data.order)
      setError('')
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  // Poll for order updates every 5 seconds
  useEffect(() => {
    fetchOrderDetails() // Initial fetch

    const interval = setInterval(() => {
      fetchOrderDetails()
    }, 5000) // Poll every 5 seconds

    return () => clearInterval(interval) // Cleanup on unmount
  }, [orderId])

  // Calculate total
  const calculateTotal = () => {
    if (!order) return '0.00'
    return order.items.reduce((total, item) => total + (item.price * item.quantity), 0).toFixed(2)
  }

  // Get status color and display text
  const getStatusInfo = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending':
        return { color: 'bg-yellow-100 text-yellow-800 border-yellow-300', text: 'Pending', icon: '⏳' }
      case 'preparing':
        return { color: 'bg-blue-100 text-blue-800 border-blue-300', text: 'Preparing', icon: '👨‍🍳' }
      case 'ready':
        return { color: 'bg-purple-100 text-purple-800 border-purple-300', text: 'Ready for Pickup', icon: '📦' }
      case 'in_transit':
        return { color: 'bg-indigo-100 text-indigo-800 border-indigo-300', text: 'In Transit', icon: '🤖' }
      case 'delivered':
        return { color: 'bg-green-100 text-green-800 border-green-300', text: 'Delivered', icon: '✅' }
      case 'cancelled':
        return { color: 'bg-red-100 text-red-800 border-red-300', text: 'Cancelled', icon: '❌' }
      default:
        return { color: 'bg-gray-100 text-gray-800 border-gray-300', text: status, icon: '📋' }
    }
  }

  if (loading && !order) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#E8D5FF' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-lg font-semibold text-gray-700">Loading order details...</p>
        </div>
      </div>
    )
  }

  if (error && !order) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#E8D5FF' }}>
        <div className="bg-white rounded-xl p-8 shadow-lg max-w-md">
          <div className="text-red-500 text-6xl mb-4 text-center">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4 text-center">Error Loading Order</h2>
          <p className="text-gray-600 mb-6 text-center">{error}</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    )
  }

  if (!order) return null

  const statusInfo = getStatusInfo(order.status)

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#E8D5FF' }}>
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => router.push('/dashboard')}
                className="text-purple-600 hover:text-purple-700 font-semibold"
              >
                ← Back to Dashboard
              </button>
              <h1 className="text-3xl font-bold text-black">Order #{order.id}</h1>
            </div>
            <img 
              src="/WashU.png" 
              alt="WashU Logo" 
              className="h-10 w-auto"
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 lg:px-8 py-12">
        
        {/* Status Card */}
        <div className={`rounded-xl p-6 mb-8 border-2 ${statusInfo.color}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-4xl">{statusInfo.icon}</span>
              <div>
                <h2 className="text-2xl font-bold">Order Status</h2>
                <p className="text-lg mt-1">{statusInfo.text}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm opacity-75">Last updated</p>
              <p className="text-xs opacity-60">Just now</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          
          {/* Order Details */}
          <div className="bg-white rounded-xl p-6 shadow-md border border-purple-200">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Order Details</h3>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-600">Order ID</p>
                <p className="font-semibold text-gray-900">#{order.id}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Vendor</p>
                <p className="font-semibold text-gray-900 capitalize">{order.vendorName}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Placed At</p>
                <p className="font-semibold text-gray-900">
                  {new Date(order.created_at).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Dropoff Location</p>
                <p className="font-semibold text-gray-900">
                  {order.dropoff_coordinates?.name || order.dropOffLocation}
                </p>
              </div>
              {order.robotId && (
                <div>
                  <p className="text-sm text-gray-600">Assigned Robot</p>
                  <p className="font-semibold text-gray-900">{order.robotId}</p>
                </div>
              )}
            </div>
          </div>

          {/* Items Summary */}
          <div className="bg-white rounded-xl p-6 shadow-md border border-purple-200">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Items</h3>
            <div className="space-y-3">
              {order.items.map((item, i) => (
                <div key={i} className="flex justify-between items-start border-b border-gray-100 pb-2">
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">{item.item_name}</p>
                    <p className="text-sm text-gray-600">Qty: {item.quantity}</p>
                  </div>
                  <p className="font-semibold text-gray-900">
                    ${(item.price * item.quantity).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-200 mt-4 pt-4">
              <div className="flex justify-between items-center">
                <span className="text-lg font-bold text-gray-900">Total</span>
                <span className="text-2xl font-bold text-purple-600">${calculateTotal()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Status Timeline */}
        <div className="bg-white rounded-xl p-6 shadow-md border border-purple-200">
          <h3 className="text-xl font-bold text-gray-900 mb-6">Order Progress</h3>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                ['pending', 'preparing', 'ready', 'in_transit', 'delivered'].includes(order.status.toLowerCase())
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-300 text-gray-600'
              }`}>
                ✓
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900">Order Placed</p>
                <p className="text-sm text-gray-600">Your order has been received</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                ['preparing', 'ready', 'in_transit', 'delivered'].includes(order.status.toLowerCase())
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-300 text-gray-600'
              }`}>
                ✓
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900">Preparing</p>
                <p className="text-sm text-gray-600">Your order is being prepared</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                ['ready', 'in_transit', 'delivered'].includes(order.status.toLowerCase())
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-300 text-gray-600'
              }`}>
                ✓
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900">Ready for Pickup</p>
                <p className="text-sm text-gray-600">Order is ready, waiting for robot</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                ['in_transit', 'delivered'].includes(order.status.toLowerCase())
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-300 text-gray-600'
              }`}>
                ✓
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900">In Transit</p>
                <p className="text-sm text-gray-600">Robot is on the way to you</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                order.status.toLowerCase() === 'delivered'
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-300 text-gray-600'
              }`}>
                ✓
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900">Delivered</p>
                <p className="text-sm text-gray-600">Your order has been delivered</p>
              </div>
            </div>
          </div>
        </div>

        {/* Auto-refresh indicator */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            🔄 Auto-refreshing every 5 seconds
          </p>
        </div>
      </main>
    </div>
  )
}
