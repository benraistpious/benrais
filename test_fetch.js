const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxAeSVB_CNsi6CTdqrtQfth1xQ03Z-23OYifDL3ziwy_eifJMZRPegE1b83OxW5W3Cn/exec';

const payload = {
  action: 'submitProject',
  data: {
    client_name: 'test',
    email: 'test@test.com'
  },
  files: []
};

async function test() {
  try {
    console.log('Sending POST request...');
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(payload)
    });
    console.log('Status:', response.status);
    console.log('Headers:', Object.fromEntries(response.headers.entries()));
    const text = await response.text();
    console.log('Body:', text);
  } catch (e) {
    console.error('Fetch error:', e);
  }
}

test();
