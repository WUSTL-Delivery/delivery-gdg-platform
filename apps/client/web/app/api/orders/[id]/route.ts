import { NextRequest, NextResponse } from 'next/server';
import supabase from '@/components/supabase';


export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: orderId } = await params;
    // Fetch order from database
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      console.error('Order lookup error:', orderError);
      return NextResponse.json(
        { message: 'Order not found' },
        { status: 404 }
      );
    }

    // Fetch order items
    const { data: items, error: itemsError } = await supabase
      .from('orderItems')
      .select('*')
      .eq('orderId', orderId);

    if (itemsError) {
      console.error('Order items lookup error:', itemsError);
      return NextResponse.json(
        { message: 'Failed to fetch order items' },
        { status: 500 }
      );
    }

    // If there's a dropOffLocation ID, fetch the location details
    let dropoffCoordinates = null;
    if (order.dropOffLocation) {
      const { data: locationData } = await supabase
        .from('coordinates')
        .select('*')
        .eq('id', order.dropOffLocation)
        .single();
      
      dropoffCoordinates = locationData;
    }

    //find vendor name
    const { data: vendorData } = await supabase
      .from('vendors')
      .select('name')
      .eq('id', order.vendorId)
      .single();

     if (vendorData) {
      order.vendorName = vendorData.name;
    } else {
      order.vendorName = 'Unknown Vendor';
    }

    // Combine order with items
    const fullOrder = {
      ...order,
      items: items.map(item => ({
        item_id: item.itemId || item.item_id,
        item_name: item.itemName || item.item_name,
        quantity: item.quantity,
        price: item.price,
      })),
      dropoff_coordinates: dropoffCoordinates,
    };

    return NextResponse.json(
      {
        message: 'Order retrieved successfully',
        order: fullOrder,
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('Error fetching order:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}
