if ( typeof ProductsSet !== 'function' ) {

  class ProductsSet extends HTMLElement {

    constructor() {

      super();

      this.initSet();
      this.checkSet();

      this.querySelector('[data-js-add-set-to-cart]' ).addEventListener('click', e=>{

        let items = [];
        Object.keys(this.set).map(key=>{
          if ( this.set[key] !== null ) {
            items.push({
              id: this.set[key],
              quantity: 1
            })
          }
        });

        if ( items.length > 0 ) {
            
          const submitButton = this.querySelector('[data-js-add-set-to-cart]');
          submitButton.classList.add('working');

          window.handleAddToCart(
            JSON.stringify({'items': items}), items.length,
            { 'Content-Type': 'application/json' },
            ()=>{
              submitButton.classList.remove('working');
              this.returnToDefaultSate();
            }
          );

        }

      });

    }

    initSet(){

      this.set = {};

      this.querySelectorAll('product-variants').forEach(elm=>{
        if ( ! elm.hasAttribute('data-has-variants') && ! elm.hasAttribute('data-unavailable') ) {
          this.set[elm.dataset.id] = elm.parentNode.querySelector('input[name="id"]').value;
        } else {
          this.set[elm.dataset.id] = null;
          elm.addEventListener('VARIANT_CHANGE', e=>{
            let variant = e.target.currentVariant;
            if ( variant ) {
              this.set[elm.dataset.id] = elm.parentNode.querySelector('input[name="id"]').value;
              elm.closest('[data-js-product-item]').classList.add('selected');
             /// elm.closest('toggle-tab').querySelector('[data-js-product-variant-title]').textContent = variant.title;
            } else {
              this.set[elm.dataset.id] = null;
              ///elm.closest('toggle-tab').querySelector('[data-js-product-variant-title]').textContent = '';
            }
            this.checkSet();
          })
        }
      });

    }

    checkSet() {
      
      let setFull = true;

      Object.keys(this.set).map(key=>{
        if ( this.set[key] === null ) {
          setFull = false;
        }
      })

      if ( setFull && this.classList.contains('products-set--empty' ) ) {
        this.classList.remove('products-set--empty');
        this.querySelector('[data-js-add-set-to-cart-text]').textContent = KROWN.settings.locales.sets_add_to_cart;
      } else if ( ! setFull && ! this.classList.contains('products-set--empty' ) ) {
        this.classList.add('products-set--empty');
      }

      return setFull;

    }

    returnToDefaultSate(){
      this.querySelectorAll('product-variants').forEach(elm=>{
        elm.querySelectorAll('input').forEach(input=>{
          input.checked = false;
        })
        elm.querySelectorAll('select').forEach(select=>{
          select.selectedIndex = 0;
        })
        if ( ! ( ! elm.hasAttribute('data-has-variants') && ! elm.hasAttribute('data-unavailable') ) ) {
          elm.currentVariant = undefined;
          elm.parentNode.querySelector('[data-js-product-add-to-cart]').classList.add('disabled');
        } 
      });
      this.querySelectorAll('[data-js-product-item]').forEach(elm=>{
        elm.classList.remove('selected');
      });
      this.initSet();
      this.checkSet();
      this.querySelector('[data-js-add-set-to-cart-text]').textContent = KROWN.settings.locales.sets_choose_products;
    }

  }

  if ( typeof customElements.get('products-set') == 'undefined' ) {
    customElements.define('products-set', ProductsSet);
  }

}