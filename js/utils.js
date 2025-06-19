function updateElementProperty(elementId, property, value) {
    const element = document.getElementById(elementId);
    if (element) {
      element[property] = value;
    }
  }