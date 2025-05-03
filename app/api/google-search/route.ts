import { NextRequest, NextResponse } from 'next/server';

// Mock data for development
const MOCK_SERP_RESPONSE = {
  searchParameters: {
    q: "example query",
    gl: "us",
    hl: "en",
    num: 10,
    type: "search"
  },
  organic: [
    {
      title: "Example Search Result 1",
      link: "https://example.com/result1",
      snippet: "This is a mock search result for development purposes. It provides example content when the actual API is not available.",
      position: 1
    },
    {
      title: "Example Search Result 2",
      link: "https://example.com/result2",
      snippet: "Another mock search result. In production, you would see actual Google search results here from the SERP API.",
      position: 2
    },
    {
      title: "Example Search Result 3",
      link: "https://example.com/result3",
      snippet: "A third mock search result. Please configure a valid Google SERP API key to see real results.",
      position: 3
    }
  ],
  peopleAlsoAsk: [
    {
      question: "What is a mock API response?",
      snippet: "A mock API response is simulated data used during development to represent what a real API would return. It allows developers to test functionality without calling the actual API."
    },
    {
      question: "How do I get a Google SERP API key?",
      snippet: "You can get a Google SERP API key by signing up at https://serper.dev/ and following their documentation to create and activate your API key."
    }
  ]
};

export async function POST(request: NextRequest) {
  try {
    // Get the query from the request body
    const body = await request.json();
    const query = body.q;
    
    if (!query) {
      return NextResponse.json({ error: 'Query parameter is required' }, { status: 400 });
    }
    
    console.log('Proxying Google SERP request for query:', query);
    
    const apiKey = process.env.GOOGLE_WEB_SEARCH_API_KEY;
    console.log('API Key:', apiKey);
    if (!apiKey || apiKey === "PUT_YOUR_ACTUAL_API_KEY_HERE") {
      console.error('Google SERP API key not found in environment variables or is using placeholder value');
      console.log('Using mock data instead for development');
      
      // Return mock data for development
      const mockData = {
        ...MOCK_SERP_RESPONSE,
        searchParameters: {
          ...MOCK_SERP_RESPONSE.searchParameters,
          q: query
        }
      };
      
      return NextResponse.json(mockData);
    }
    
    console.log('Using Google SERP API key:', apiKey.substring(0, 4) + '...');
    
    // Make the request to Google SERP API
    const serpResponse = await fetch(
      'https://google.serper.dev/search',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': apiKey,
        },
        body: JSON.stringify({ q: query }),
      }
    );
    
    if (!serpResponse.ok) {
      const errorText = await serpResponse.text();
      console.error(`Google SERP API error: ${serpResponse.status}`, errorText);
      console.log('Falling back to mock data due to API error');
      
      // Return mock data as fallback
      const mockData = {
        ...MOCK_SERP_RESPONSE,
        searchParameters: {
          ...MOCK_SERP_RESPONSE.searchParameters,
          q: query
        }
      };
      
      return NextResponse.json(mockData);
    }
    
    // Get the response data
    const data = await serpResponse.json();
    
    // Return the data
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in Google SERP proxy:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 