const run = async () => {
  const code = `
    const contacts = window.require('WAWebCollections').Contact.getModelsArray();
    const lids = contacts.filter(c => c.id && c.id._serialized.endsWith('@lid') && !c.phoneNumber);
    const samples = lids.slice(0, 10).map(c => {
      return {
        id: c.id._serialized,
        name: c.name,
        pushname: c.pushname,
        displayNameLID: c.displayNameLID,
        formattedName: c.formattedName,
        userid: c.userid
      };
    });
    return samples;
  `;
  
  try {
    const res = await fetch('http://localhost:3001/api/debug-eval', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    const data = await res.json();
    console.log('Result:', data.result);
  } catch (error) {
    console.error('Error:', error.message);
  }
};

run();
