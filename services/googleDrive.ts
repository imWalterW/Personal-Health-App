
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "225444197566-cll5ahqpvftnod413pjaua0jkaj9sjiq.apps.googleusercontent.com";
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata';
const FILENAME = 'vitalsync_data.json';

let tokenClient: any;

export const initGoogleAuth = (onSuccess: (token: string) => void) => {
  if (typeof window === 'undefined' || !(window as any).google) {
    // Retry if google script hasn't loaded yet
    setTimeout(() => initGoogleAuth(onSuccess), 500);
    return;
  }
  
  if (!CLIENT_ID) {
    console.warn("Google Client ID is not defined. Drive features disabled.");
    return;
  }
  
  try {
    tokenClient = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (tokenResponse: any) => {
        if (tokenResponse.access_token) {
          onSuccess(tokenResponse.access_token);
        }
      },
    });
  } catch (error) {
    console.error("Failed to initialize Google Auth:", error);
  }
};

export const signInToGoogle = () => {
  if (tokenClient) {
    tokenClient.requestAccessToken();
  } else {
    console.warn("Google Auth not initialized");
    if (!CLIENT_ID) {
      alert("Google Client ID is missing.");
    }
  }
};

export const uploadDataToDrive = async (data: any, token: string) => {
  try {
    // 1. Search for existing file in appDataFolder
    const searchUrl = new URL('https://www.googleapis.com/drive/v3/files');
    searchUrl.searchParams.append('q', `name = '${FILENAME}' and 'appDataFolder' in parents and trashed = false`);
    searchUrl.searchParams.append('spaces', 'appDataFolder');
    
    const searchRes = await fetch(searchUrl.toString(), {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (!searchRes.ok) throw new Error('Failed to search Drive files');
    
    const searchData = await searchRes.json();
    const fileId = searchData.files?.[0]?.id;

    // 2. Prepare upload
    const fileContent = JSON.stringify(data);
    const metadata = {
      name: FILENAME,
      mimeType: 'application/json',
      parents: fileId ? undefined : ['appDataFolder']
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([fileContent], { type: 'application/json' }));

    let uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    let method = 'POST';

    if (fileId) {
      uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`;
      method = 'PATCH';
    }

    const res = await fetch(uploadUrl, {
      method,
      headers: { Authorization: `Bearer ${token}` },
      body: form
    });
    
    if (!res.ok) throw new Error('Upload failed');
    return await res.json();
  } catch (error) {
    console.error('Drive Upload Error:', error);
    throw error;
  }
};

export const downloadDataFromDrive = async (token: string) => {
  try {
    // 1. Search for file
    const searchUrl = new URL('https://www.googleapis.com/drive/v3/files');
    searchUrl.searchParams.append('q', `name = '${FILENAME}' and 'appDataFolder' in parents and trashed = false`);
    searchUrl.searchParams.append('spaces', 'appDataFolder');
    
    const searchRes = await fetch(searchUrl.toString(), {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (!searchRes.ok) throw new Error('Failed to search Drive files');
    
    const searchData = await searchRes.json();
    const fileId = searchData.files?.[0]?.id;

    if (!fileId) throw new Error('No backup found in Google Drive');

    // 2. Download content
    const downloadRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (!downloadRes.ok) throw new Error('Download failed');
    return await downloadRes.json();
  } catch (error) {
    console.error('Drive Download Error:', error);
    throw error;
  }
};
