if ( typeof QuickBuy !== 'function' ) {

	class QuickBuy extends HTMLElement {
		
		constructor(){

			super();

			// Product variant event listener for theme specific logic

			this.zIndex = 99;

			const hasProductItem = this.closest('[data-js-product-item]');

			this.productVariants = this.querySelector('product-variants');

			if ( hasProductItem ) {
				this.variantImages = this.querySelector('[data-js-quick-buy-product-images]');
				this.productImage = this.closest('[data-js-product-item]').querySelector('[data-js-product-item-image]');
				this.variantImagesSliders = this.hasAttribute('data-variant-images-slider');
				this.productSlider = this.closest('[data-js-product-item]').querySelector('css-slider');
			}

			this.productVariants.addEventListener('VARIANT_CHANGE', this.onVariantChangeHandler.bind(this));
			this.onVariantChangeHandler({target:this.productVariants});

			if ( this.variantImages ) {

				setTimeout(()=>{
					const imageObserver = new IntersectionObserver((entries, observer) => {
						if ( ! entries[0].isIntersecting ) {
							return;
						} else {
							this.variantImages.querySelectorAll(`template`).forEach(elm=>{
								if ( ! elm.dataset.init ) {
									this.initVariantImage(elm);
								}
							});
							observer.unobserve(this);
						}
					});
					imageObserver.observe(this);
				}, 5000)
			
			}

			setTimeout(()=>{

				this.querySelectorAll('.product-variant__item--radio').forEach(elm=>{

					elm.addEventListener('click', e=>{

						elm.closest('.css-slider-holder').scrollTo({
							top: 0,
							left: elm.offsetLeft - 40,
							behavior: 'smooth'
						});

						if ( elm.classList.contains('product-variant__item--color' ) ) {
							elm.closest('.product-variant').querySelector('.product-variant__item-text-label').textContent = elm.querySelector('input').value;
						}

					})
				});

			}, 1000);

			// trigger cart popup 

			if ( this.querySelector('[data-js-quick-buy-form]') ) {
				this.querySelector('form').addEventListener('submit', e=>{

					e.preventDefault();
			
					const submitButton = this.querySelector('[type="submit"]');
					submitButton.classList.add('working');

					window.handleAddToCart(
						this._serializeForm(e.currentTarget), 1,
						{
							'Content-Type': 'application/x-www-form-urlencoded',
							'X-Requested-With': 'XMLHttpRequest'
						},
						()=>{
							submitButton.classList.remove('working');
						}
					);

				});
				
			}

			// update product card prices

			setTimeout(()=>{

				if ( hasProductItem ) {

					const cardPrice = this.closest('[data-js-product-item]').querySelector('[data-js-product-item-price]');
					const buttonPrice = this.querySelector('[data-js-product-add-to-cart-text]');
					const button = this.querySelector('[data-js-product-add-to-cart]')
					const productPrice = this.querySelector('[data-js-quick-buy-product-price]');

					new MutationObserver(()=>{
						if ( cardPrice ) {
							cardPrice.innerHTML = productPrice.innerHTML;
							if ( productPrice.querySelector('[data-js-product-price-original]').textContent != '' ) {
								cardPrice.parentNode.classList.remove('product-item__price--empty');
							} else {
								cardPrice.parentNode.classList.add('product-item__price--empty');
							}
						}
						if ( this.dataset.addToCartPrice == "true" && ! button.classList.contains('disabled') ) {
							buttonPrice.innerHTML = `${buttonPrice.innerHTML} <span class='element--hide-on-small'>- ${productPrice.innerHTML}</span>`;
						}
					}).observe(productPrice, {
						attributes: false, childList: true, subtree: true
					})

				}

				if ( this.dataset.defaultToFirstVariant == 'true' ) {
					this.querySelector('product-variants').updatePrice();
				}

			}, 10);

		}

		onVariantChangeHandler(e){

			const variant = e.target.currentVariant;

			if ( variant ) {

				if ( this.variantImages ) {
				
					if ( variant.featured_media != null ) {
						const variantImg = this.variantImages.querySelector(`template[data-media-id="${variant.featured_media.id}"]`);
						if ( ! variantImg.dataset.init ) {
							this.initVariantImage(variantImg);
							this.showVariantImage(variant.featured_media.id);
						} else {
							this.showVariantImage(variant.featured_media.id);
						}
					}

				} else if ( this.variantImagesSliders ) {

					if ( variant.featured_image != null && this.productSlider ) {
						const variantImg = this.productSlider.querySelector(`.product-item__image-${variant.featured_image.id}`);
						this.productSlider.changeSlide(variantImg.dataset.index);
					}

				}

			}

		}

		initVariantImage(template) {
			template.dataset.init = true;
			const image = template.content.querySelector('figure').cloneNode(true);
			image.dataset.mediaId = template.dataset.mediaId;
			this.productImage.append(image);
		}

		showVariantImage(id) {
			this.productImage.querySelector('.product-item__image-figure--on-top')?.classList.remove('product-item__image-figure--on-top');
			this.productImage.querySelector(`[data-media-id="${id}"]`).classList.add('product-item__image-figure--on-top');
			this.productImage.querySelector(`[data-media-id="${id}"] img`).srcset = this.productImage.querySelector(`[data-media-id="${id}"] img`).srcset;
			this.productImage.querySelector(`[data-media-id="${id}"]`).style.zIndex = ++this.zIndex;
		}

		_serializeForm(form) {
			let arr = [];
			Array.prototype.slice.call(form.elements).forEach(function(field) {
				if (
					!field.name ||
					field.disabled ||
					['file', 'reset', 'submit', 'button'].indexOf(field.type) > -1
				)
					return;
				if (field.type === 'select-multiple') {
					Array.prototype.slice.call(field.options).forEach(function(option) {
						if (!option.selected) return;
						arr.push(
							encodeURIComponent(field.name) +
								'=' +
								encodeURIComponent(option.value)
						);
					});
					return;
				}
				if (['checkbox', 'radio'].indexOf(field.type) > -1 && !field.checked)
					return;
				arr.push(
					encodeURIComponent(field.name) + '=' + encodeURIComponent(field.value)
				);
			});
			return arr.join('&');
		}

	}

  if ( typeof customElements.get('quick-buy') == 'undefined' ) {
		customElements.define('quick-buy', QuickBuy);
	}

}

if ( ! window.handleAddToCart ) {

	window.handleAddToCart = (body, items, headers, callback) => {
		
		let alert = '';

		fetch(`${KROWN.settings.routes.cart_add_url}.js`, {
			body: body,
			headers: headers,
			method: 'POST'
		})
		.then(response => response.json())
		.then(response => {
			if ( response.status == 422 ) {
				// wrong stock logic alert
				alert = document.createElement('span');
				alert.className = 'alert alert--error';
				alert.innerHTML = response.description
				return fetch('?section_id=helper-cart');
			} else {
				return fetch('?section_id=helper-cart');
			}
		})
		.then(response => response.text())
		.then(text => {

			let doNext = false;

			if ( document.body.classList.contains('template-cart' ) ) {
				doNext = "page";
			} else {
				if ( KROWN.settings.cart_popup == "true" && document.getElementById('mini-cart-popup') ) {
					doNext = "popup";
				} else if ( KROWN.settings.cart_action == "overlay" && document.getElementById('site-cart-sidebar') ) {
					doNext = "drawer";
				} else {
					doNext = "page";
				}
			}

			if ( doNext == "page" ) {
				window.location.href = KROWN.settings.routes.cart_url;
			} else {

				if ( document.getElementById('site-cart-sidebar') ) {

					const sectionInnerHTML = new DOMParser().parseFromString(text, 'text/html');
					const cartFormInnerHTML = sectionInnerHTML.getElementById('AjaxCartForm').innerHTML;
					const cartSubtotalInnerHTML = sectionInnerHTML.getElementById('AjaxCartSubtotal').innerHTML;

					const cartItems = document.getElementById('AjaxCartForm');
					cartItems.innerHTML = cartFormInnerHTML;
					cartItems.ajaxifyCartItems();

					document.querySelectorAll('[data-header-cart-count]').forEach(elm=>{
						elm.innerHTML = document.querySelector('#AjaxCartForm [data-cart-count]').innerHTML;
					});

					if ( document.getElementById('cart-recommendations-sidebar') ) {
						document.getElementById('cart-recommendations-sidebar').generateRecommendations();
					}

					if ( alert != '' ) {
						document.getElementById('AjaxCartForm').querySelector('form').prepend(alert);
					}
					document.getElementById('AjaxCartSubtotal').innerHTML = cartSubtotalInnerHTML;
					
				}

				if ( doNext == "drawer" ) {
					document.getElementById('site-cart-sidebar').show();
				} else {
					const miniCartPopup = document.getElementById('mini-cart-popup')
					if ( items == 1 ) {
						miniCartPopup.querySelector('[data-js-mini-cart-single]').style.display = 'block';
						miniCartPopup.querySelector('[data-js-mini-cart-plural]').style.display = 'none';
					} else {
						miniCartPopup.querySelector('[data-js-mini-cart-plural]').style.display = 'block';
						miniCartPopup.querySelector('[data-js-mini-cart-plural]').innerHTML = KROWN.settings.locales.cart_added_items_count.replace('{{ count }}', items);
						miniCartPopup.querySelector('[data-js-mini-cart-single]').style.display = 'none';
					}
					miniCartPopup.show();
					if ( miniCartPopup.dataset.hide != '0' ) {
						setTimeout(()=>{
							miniCartPopup.hide();
						}, parseInt(miniCartPopup.dataset.hide));
					}
				}
				
			}

		})
		.catch(e => {
			console.log(e);
		})
		.finally(() => {
			callback();
		});

	}

}