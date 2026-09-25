import { NextRequest, NextResponse } from 'next/server';
import supabase from '@/components/supabase';
import { jwtVerify } from 'jose';
import { getOrderClient } from '@/lib/grpc-client';
import { promisify } from 'util';
import { getJwtSecretKey } from '@/lib/jwt-secret';

export async function POST(request: NextRequest) {
  try {
    // Get user from JWT token
    const token = request.cookies.get('auth-token')?.value;
    let userId = null;

    if (token) {
      try {
        const { payload } = await jwtVerify(token, getJwtSecretKey());
        userId = payload.userId as string;
      } catch (error) {
        console.error('JWT verification failed:', error);
      }
    }

    const orderData = await request.json();
    console.log('Received order data:', orderData);
    // Validate required fields
    if (!orderData.vendor_id || !orderData.items || orderData.items.length === 0) {
      return NextResponse.json(
        { message: 'Vendor and items are required' },
        { status: 400 }
      );
    }

    if (!orderData.dropoff_loc_id) {
      return NextResponse.json(
        { message: 'Dropoff location is required' },
        { status: 400 }
      );
    }

    // Query the coordinates table to get the location details based on name
    const { data: locationData, error: locationError } = await supabase
      .from('coordinates')
      .select('*')
      .eq('name', orderData.dropoff_loc_id.toLowerCase())
      .single();

    if (locationError || !locationData) {
      console.error('Location lookup error:', locationError);
      return NextResponse.json(
        { message: 'Invalid dropoff location' },
        { status: 400 }
      );
    }

    // Query vendor table to get vendor ID
    const { data: vendorData, error: vendorError } = await supabase
      .from('vendors')
      .select('*')
      .eq('name', orderData.vendor_id.toLowerCase())
      .single();

    if (vendorError || !vendorData) {
      console.error('Vendor lookup error:', vendorError);
      return NextResponse.json(
        { message: 'Invalid vendor' },
        { status: 400 }
      );
    }

    // Get actual user_id from JWT token or use placeholder
    const finalUserId = userId || "guest-user";

    // Prepare order items for protobuf format
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const protoItems = orderData.items.map((item: any) => ({
      item_id: item.item_id,
      item_name: item.item_name,
      quantity: item.quantity,
      price: item.price,
    }));

    // Create the gRPC order object matching your protobuf structure
    const grpcOrder = {
      order_id: 0, // Will be assigned by the gRPC server
      user_id: finalUserId,
      vendor_id: vendorData.id, // Use the vendor_id from the vendors table
      items: protoItems,
      status: 'pending',
      created_at: {
        seconds: Math.floor(Date.now() / 1000),
        nanos: 0,
      },
      dropoff_loc_id: locationData.id.toString(), // Send the location ID (not name)
      robot_id:null, // Empty string for null, will be assigned by matching system
    };

    // Make gRPC call to InsertOrder
    const client = getOrderClient();
    const insertOrder = promisify(client.InsertOrder.bind(client));

    try {
      const response = await insertOrder({ order: grpcOrder });
      
      return NextResponse.json(
        {
          message: 'Order created successfully',
          order_id: response.order.order_id,
          order: response.order,
          grpc_message: response.return_msg,
        },
        { status: 201 }
      );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (grpcError: any) {
      console.error('gRPC error:', grpcError);
      return NextResponse.json(
        { message: 'Failed to create order via gRPC', error: grpcError.message },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Order creation error:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}