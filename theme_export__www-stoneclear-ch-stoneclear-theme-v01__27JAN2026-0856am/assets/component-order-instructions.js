KROWN.saveToSessionStorage = () => {
  const specialInstructions = document.getElementById('cartSpecialInstructions').value;
  sessionStorage.setItem('cartSpecialInstructions', specialInstructions);
}
document.getElementById('cartSpecialInstructions').addEventListener('input', KROWN.saveToSessionStorage);

KROWN.loadFromSessionStorage = () => {
  const savedInstructions = sessionStorage.getItem('cartSpecialInstructions');
  if ( savedInstructions ) {
    document.getElementById('cartSpecialInstructions').value = savedInstructions;
  }
}
document.addEventListener('DOMContentLoaded', KROWN.loadFromSessionStorage);