import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const query = searchParams.get('q');
    
    if (!query) {
      return NextResponse.json({ error: 'Query parameter is required' }, { status: 400 });
    }
    
    console.log('Proxying Brave Search request for query:', query);
    
    const apiKey = process.env.BRAVE_WEB_SEARCH_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }
    
    // Make the request to Brave Search API
    const braveResponse = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=3`,
      {
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': apiKey,
        },
      }
    );
    
    if (!braveResponse.ok) {
      const errorText = await braveResponse.text();
      console.error(`Brave Search API error: ${braveResponse.status}`, errorText);
      return NextResponse.json(
        { error: `Brave Search API error: ${braveResponse.status}` }, 
        { status: braveResponse.status }
      );
    }
    
    // Get the response data
    const data = await braveResponse.json();
    
    // Return the data
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in Brave Search proxy:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 