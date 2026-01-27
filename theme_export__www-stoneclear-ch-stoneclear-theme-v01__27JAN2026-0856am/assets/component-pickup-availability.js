if ( typeof PickupAvailabilityExtended !== 'function' ) {

  class PickupAvailabilityExtended extends HTMLElement {

    constructor() {
      super();
      this.classList.add('active');
      this.fetchAvailability(this.dataset.variantId);
    }

    fetchAvailability(variantId) {
      
      const variantSectionUrl = `${this.dataset.baseUrl}variants/${variantId}/?section_id=helper-pickup-availability-extended`;
      fetch(variantSectionUrl)
        .then(response => response.text())
        .then(text => {
          const sectionInnerHTML = new DOMParser()
            .parseFromString(text, 'text/html')
            .querySelector('.shopify-section');
          this.renderPreview(sectionInnerHTML);
        })
        .catch(e => {
          console.log(e);
        });

    }

    renderPreview(sectionInnerHTML) {
      const availabilityWidget = sectionInnerHTML.querySelector('#PickupAvailabilityWidget');
      if ( availabilityWidget ) {
        this.innerHTML = availabilityWidget.innerHTML;
        this.querySelectorAll('.pickup-availability-widget__location-view').forEach(elm=>{
          elm.addEventListener('click', ()=>{
            document.getElementById(`${elm.getAttribute('aria-controls')}`).classList.toggle('opened');
            elm.setAttribute('aria-selected', elm.getAttribute('aria-selected') == "true" ? "false" : "true");
          })
        })
      } else {
        console.log('error in availablity fetch');
      }

      const availabilitySidebar = sectionInnerHTML.querySelector('#PickupAvailabilitySidebar');
      if ( availabilitySidebar ) {
        if ( document.querySelector('sidebar-drawer#site-availability-sidebar') ) {
          document.querySelector('sidebar-drawer#site-availability-sidebar').remove();
        } 
        document.body.appendChild(availabilitySidebar.querySelector('#site-availability-sidebar'));
        document.querySelector('.pickup-availability-widget__more').addEventListener('click', e=>{
          e.preventDefault();
          document.getElementById('site-availability-sidebar').show();
        })
      }

    }

  }

  if ( typeof customElements.get('pickup-availability-extended') == 'undefined' ) {
    customElements.define('pickup-availability-extended', PickupAvailabilityExtended);
	}

}