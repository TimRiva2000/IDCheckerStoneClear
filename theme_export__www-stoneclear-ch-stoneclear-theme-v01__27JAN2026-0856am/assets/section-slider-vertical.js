if ( typeof SliderVertical !== 'function' ) {

  class SliderVertical extends HTMLElement {

    constructor() {
      super();
    }

    init(){

      this.items = this.querySelectorAll('[data-js-item]');
      this.prlxItems = this.querySelectorAll('[data-scroll-speed]');
      this.slider = this.querySelector('[data-js-element]');

      this.bgImage = this.querySelector('[data-js-background-image]');
      if ( this.bgImage ) {
        this.bgImageFigure = this.bgImage.querySelector('figure');
      }

      this.calculateHeight();
      window.addEventListener('resize', debounce(()=>{
        this.scrollParallax();
        if ( this.bgImage ) {
          this.scrollBackground();
        }
        this.calculateHeight();
      }, 300));

      if ( this.prlxItems.length > 0 ) {
        this._raf = true;
        this.scrollParallax();
        this.calculateHeight();
        window.addEventListener('scroll',()=>{
          if ( this._raf ) {
            this._raf = false;
            requestAnimationFrame(this.scrollParallax.bind(this));
            if ( this.bgImage ) {
              requestAnimationFrame(this.scrollBackground.bind(this));
            }
          }
        }, {passive: true});
      }
    }

    scrollBackground(){
      if ( Math.abs(this.bgImage.getBoundingClientRect().y) < window.innerHeight ) {
        this.bgImageFigure.style.transform = `translateY(${this.bgImage.getBoundingClientRect().y / -2}px)`;
      }
    } 

    scrollParallax() {
      const windowHeight = document.documentElement.clientHeight;
      const windowWidth = document.documentElement.clientWidth;
      this.prlxItems.forEach(elm=>{
        let elementY = elm.getBoundingClientRect().y;
        let scrollFactor = Number(elm.dataset.scrollSpeed);
        if ( windowWidth > 768 && windowWidth > windowHeight ) {
          if ( elementY < windowHeight * 2 && elementY > (elm.offsetHeight + windowHeight)*-1 ) {
            const prlx = ( (elm.parentElement.getBoundingClientRect().y - (windowHeight - elm.parentElement.offsetHeight)/2) * scrollFactor ) / 2;
            if ( Math.abs(prlx) < windowHeight ) {
              elm.style.transform = `translateY(${prlx}px)`;
            }
          }
        }
      });
      this._raf = true;
    }

    calculateHeight() {
      let height = 0;
      this.items.forEach(elm=>{
        if ( elm.offsetHeight + elm.offsetTop > height ) {
          height = elm.offsetHeight + elm.offsetTop;
        }
      });
      this.slider.style.height = `${height}px`;
    }

  }

  if ( typeof customElements.get('slider-vertical') == 'undefined' ) {
    customElements.define('slider-vertical', SliderVertical);
  } 

}