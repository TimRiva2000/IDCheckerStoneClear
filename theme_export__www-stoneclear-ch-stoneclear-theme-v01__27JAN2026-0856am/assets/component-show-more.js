if ( typeof ShowMore !== 'function' ) {

	class ShowMore extends HTMLElement {

		constructor(){
			super();
			this.init();	
		}

		init() {

			const toggle = this.querySelector('.js-show-more');	
			const panelHeight = toggle.nextElementSibling.scrollHeight;

			toggle.classList.remove('active', 'disabled');
			toggle.parentElement.classList.remove('disabled');
			toggle.removeEventListener('click', this.onClickHandler);
			
			this.onClickHandler = e=>{
				const panel = e.currentTarget.nextElementSibling;
				if ( ! e.currentTarget.classList.contains('active') ) {
					e.currentTarget.classList.add("active");
					e.currentTarget.innerHTML = KROWN.settings.locales.show_less;
					panel.style.maxHeight = `${panel.scrollHeight}px`;
					setTimeout(()=>{
						panel.style.maxHeight = `initial`;
					}, 510);
				} else {
					e.currentTarget.classList.remove("active");
					e.currentTarget.innerHTML = KROWN.settings.locales.show_more;
					panel.style.maxHeight = `${panel.scrollHeight}px`;
					setTimeout(()=>{
						panel.style.maxHeight = `var(--height)`;
					}, 10);
				}
			}

			if ( panelHeight <= parseInt(this.dataset.height)+10 ) {
				toggle.classList.add("active", "disabled");
				toggle.parentElement.classList.add('show-more--active-not-active', "disabled");

			} else {
				toggle.addEventListener('click', this.onClickHandler);
			}

			toggle.classList.add('init');

		}

	}

  if ( typeof customElements.get('show-more') == 'undefined' ) {
    customElements.define('show-more', ShowMore);
	}

}