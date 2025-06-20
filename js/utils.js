function updateElementProperty(elementId, property, value, replace = true) {
    const element = document.getElementById(elementId);
    console.log(`Updating element ${elementId} property ${property} with value:`, value);
    if (element) {
      console.log(`Element ${elementId} found.`);
      if (replace) {
        element[property] = value;
      } else {
        element[property] += value;
      }        
    }
  }