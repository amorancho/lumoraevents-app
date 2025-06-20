function updateElementProperty(elementId, property, value, replace = true) {
    const element = document.getElementById(elementId);

    if (element) {

      if (replace) {
        element[property] = value;
      } else {
        element[property] += value;
      }        
    }
  }