if ( typeof ShippingNotice !== 'function' ) {

  class ShippingNotice extends HTMLElement {

    constructor() {
      super();
      this.init();
    }

    init() {

      const freeShippingThreshold = Math.round(Number(this.getAttribute('data-free-shipping')) * (Shopify.currency.rate ? Number(Shopify.currency.rate) : 1));
      const cartTotal = Number(this.getAttribute('data-cart-total'));
      const freeShippingRemaining = cartTotal - freeShippingThreshold;
			
      let cartSliderWidth = 0;
      if ( freeShippingRemaining < 0 ) {
        this.querySelector('[data-js-free-shipping-text]').innerHTML = window.KROWN.settings.locales.shipping_notice_remaining_to_free.replace('{{ remaining_amount }}', this._formatMoney(Math.abs(freeShippingRemaining), KROWN.settings.shop_money_format));
        cartSliderWidth = 100 - (Math.abs(freeShippingRemaining) * 100 / freeShippingThreshold);
      } else {
        this.querySelector('[data-js-free-shipping-text]').innerHTML = window.KROWN.settings.locales.shipping_notice_eligible_for_free;
        cartSliderWidth = 100;
      }
			if ( this.querySelector('[data-js-free-shipping-slider]') ) {
				this.querySelector('[data-js-free-shipping-slider]').style.width = `${cartSliderWidth}%`;
			}

    }
    
    _formatMoney(cents, format) {

			if (typeof cents === 'string') {
				cents = cents.replace('.', '');
			}
	
			let value = '';
			const placeholderRegex = /\{\{\s*(\w+)\s*\}\}/;
			const formatString = format || moneyFormat;
	
			function formatWithDelimiters(number, precision, thousands, decimal) {
				thousands = thousands || ',';
				decimal = decimal || '.';
	
				if (isNaN(number) || number === null) {
					return 0;
				}
	
				number = (number / 100.0).toFixed(precision);
	
				const parts = number.split('.');
				const dollarsAmount = parts[0].replace(
					/(\d)(?=(\d\d\d)+(?!\d))/g,
					'$1' + thousands
				);
				const centsAmount = parts[1] ? decimal + parts[1] : '';
	
				return dollarsAmount + centsAmount;
			}
	
			switch (formatString.match(placeholderRegex)[1]) {
				case 'amount':
					value = formatWithDelimiters(cents, 2);
					break;
				case 'amount_no_decimals':
					value = formatWithDelimiters(cents, 0);
					break;
				case 'amount_with_comma_separator':
					value = formatWithDelimiters(cents, 2, '.', ',');
					break;
				case 'amount_no_decimals_with_comma_separator':
					value = formatWithDelimiters(cents, 0, '.', ',');
					break;
				case 'amount_no_decimals_with_space_separator':
					value = formatWithDelimiters(cents, 0, ' ');
					break;
				case 'amount_with_apostrophe_separator':
					value = formatWithDelimiters(cents, 2, "'");
					break;
			}
	
			return formatString.replace(placeholderRegex, value);
	
		}

  }

  if ( typeof customElements.get('shipping-notice') == 'undefined' ) {
    customElements.define('shipping-notice', ShippingNotice);
  }

}